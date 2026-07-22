"""Tests for exam question authoring and queued bulk imports.

Celery is never hit: the enqueue call is monkeypatched at the API boundary,
and the worker-side logic (``run_import`` / the task body) is tested directly.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.exams.models import ExamType
from apps.users.models import User

from .models import Question, QuestionImportJob
from .services import ImportFormatError, parse_question_blocks, run_import

VALID_IMPORT = """What is the ideal espresso extraction time?
10-15 seconds
*25-30 seconds
45-60 seconds

Which milk texture suits a flat white?
*Thin microfoam
Stiff dry foam
"""


@pytest.fixture
def hr_user(db):
    return User.objects.create(
        username="hr@example.com", email="hr@example.com", role=User.Role.EXAMINER
    )


@pytest.fixture
def employee_user(db):
    return User.objects.create(
        username="barista@example.com", email="barista@example.com", role=User.Role.EMPLOYEE
    )


@pytest.fixture
def barista_exam(db, hr_user):
    return ExamType.objects.create(name="Barista Exam", created_by=hr_user)


def client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def question_payload(**overrides):
    payload = {
        "text": "What roast is used for the house espresso?",
        "choices": ["Light", "Medium", "Dark"],
        "correct_index": 1,
    }
    payload.update(overrides)
    return payload


# --- Question CRUD ---


@pytest.mark.django_db
def test_hr_creates_questions_positions_append(hr_user, barista_exam):
    client = client_for(hr_user)
    url = reverse("exams:exam_questions:question-list", args=[barista_exam.pk])

    first = client.post(url, question_payload(), format="json")
    second = client.post(url, question_payload(text="Second question?"), format="json")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["position"] == 1
    assert second.json()["position"] == 2


@pytest.mark.django_db
def test_correct_index_must_point_at_a_choice(hr_user, barista_exam):
    response = client_for(hr_user).post(
        reverse("exams:exam_questions:question-list", args=[barista_exam.pk]),
        question_payload(correct_index=3),
        format="json",
    )

    assert response.status_code == 400
    assert "correct_index" in response.json()


@pytest.mark.django_db
def test_employee_cannot_touch_questions(employee_user, barista_exam):
    client = client_for(employee_user)
    url = reverse("exams:exam_questions:question-list", args=[barista_exam.pk])

    assert client.get(url).status_code == 403
    assert client.post(url, question_payload(), format="json").status_code == 403


@pytest.mark.django_db
def test_question_update_and_delete_scoped_to_exam(hr_user, barista_exam):
    other_exam = ExamType.objects.create(name="Bartender Exam")
    question = Question.objects.create(
        exam_type=barista_exam,
        text="Original?",
        choices=["A", "B"],
        correct_index=0,
        position=1,
    )
    client = client_for(hr_user)

    patched = client.patch(
        reverse("exams:exam_questions:question-detail", args=[barista_exam.pk, question.pk]),
        {"text": "Updated?"},
        format="json",
    )
    assert patched.status_code == 200
    assert patched.json()["text"] == "Updated?"

    # The same question id under a different exam's URL is a 404, not a leak.
    wrong_scope = client.get(
        reverse("exams:exam_questions:question-detail", args=[other_exam.pk, question.pk])
    )
    assert wrong_scope.status_code == 404

    deleted = client.delete(
        reverse("exams:exam_questions:question-detail", args=[barista_exam.pk, question.pk])
    )
    assert deleted.status_code == 204
    assert Question.objects.count() == 0


# --- Import parsing (worker-side) ---


def test_parse_valid_blocks():
    parsed = parse_question_blocks(VALID_IMPORT)

    assert len(parsed) == 2
    assert parsed[0].correct_index == 1
    assert parsed[0].choices == ["10-15 seconds", "25-30 seconds", "45-60 seconds"]
    assert parsed[1].correct_index == 0


@pytest.mark.parametrize(
    "source",
    [
        "Just a lonely question with no choices",
        "Question?\nOnly one choice",
        "Question?\nChoice A\nChoice B",  # nothing starred
        "Question?\n*Choice A\n*Choice B",  # two starred
        "   \n\n   ",
    ],
)
def test_parse_rejects_bad_blocks(source):
    with pytest.raises(ImportFormatError):
        parse_question_blocks(source)


@pytest.mark.django_db
def test_run_import_creates_questions_after_existing(hr_user, barista_exam):
    Question.objects.create(
        exam_type=barista_exam, text="Existing?", choices=["A", "B"], correct_index=0, position=1
    )
    job = QuestionImportJob.objects.create(
        exam_type=barista_exam, source_text=VALID_IMPORT, created_by=hr_user
    )

    run_import(job)

    job.refresh_from_db()
    assert job.status == QuestionImportJob.Status.DONE
    assert job.created_count == 2
    assert job.finished_at is not None
    positions = list(
        Question.objects.filter(exam_type=barista_exam).values_list("position", flat=True)
    )
    assert positions == [1, 2, 3]


@pytest.mark.django_db
def test_run_import_bad_input_fails_cleanly(hr_user, barista_exam):
    job = QuestionImportJob.objects.create(
        exam_type=barista_exam, source_text="not a valid block", created_by=hr_user
    )

    run_import(job)

    job.refresh_from_db()
    assert job.status == QuestionImportJob.Status.FAILED
    assert "at least two choice lines" in job.error
    assert Question.objects.count() == 0


# --- Import API (enqueue + poll) ---


@pytest.mark.django_db
def test_import_endpoint_queues_job(hr_user, barista_exam, monkeypatch):
    enqueued: list[int] = []
    monkeypatch.setattr(
        "apps.exams.questions.views.process_question_import.delay",
        lambda job_id: enqueued.append(job_id),
    )

    response = client_for(hr_user).post(
        reverse("exams:exam_questions:question-import", args=[barista_exam.pk]),
        {"text": VALID_IMPORT},
        format="json",
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == QuestionImportJob.Status.QUEUED
    # Enqueued via transaction.on_commit — fires post-commit in real requests;
    # pytest-django's TestCase transaction never commits, so the hook is pending
    # rather than lost. The job row itself must exist for the worker to find.
    assert QuestionImportJob.objects.filter(pk=body["id"]).exists()


@pytest.mark.django_db
def test_import_status_polling(hr_user, barista_exam):
    job = QuestionImportJob.objects.create(
        exam_type=barista_exam,
        source_text=VALID_IMPORT,
        created_by=hr_user,
        status=QuestionImportJob.Status.DONE,
        created_count=2,
    )

    response = client_for(hr_user).get(
        reverse("exams:exam_questions:question-import-detail", args=[barista_exam.pk, job.pk])
    )

    assert response.status_code == 200
    assert response.json()["status"] == "done"
    assert response.json()["created_count"] == 2


@pytest.mark.django_db
def test_import_requires_examiner(employee_user, barista_exam):
    response = client_for(employee_user).post(
        reverse("exams:exam_questions:question-import", args=[barista_exam.pk]),
        {"text": VALID_IMPORT},
        format="json",
    )

    assert response.status_code == 403
