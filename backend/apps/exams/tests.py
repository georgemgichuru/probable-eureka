"""Tests for exam types, email-based assignments, and exam sessions."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.users.models import User

from .models import ExamAssignment, ExamSession, ExamType


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


# --- Exam type management (HR) ---


@pytest.mark.django_db
def test_hr_can_create_exam_type(hr_user):
    response = client_for(hr_user).post(
        reverse("exams:type-list"), {"name": "Barista Exam", "description": "Coffee skills"}
    )

    assert response.status_code == 201
    exam = ExamType.objects.get(name="Barista Exam")
    assert exam.created_by == hr_user
    assert exam.is_active


@pytest.mark.django_db
def test_employee_cannot_manage_exam_types(employee_user, barista_exam):
    client = client_for(employee_user)

    assert client.post(reverse("exams:type-list"), {"name": "Sneaky"}).status_code == 403
    assert client.get(reverse("exams:type-list")).status_code == 403
    assert (
        client.post(
            reverse("exams:assignment-list", args=[barista_exam.pk]),
            {"email": "barista@example.com"},
        ).status_code
        == 403
    )


@pytest.mark.django_db
def test_hr_can_delete_exam_type(hr_user, barista_exam):
    response = client_for(hr_user).delete(reverse("exams:type-detail", args=[barista_exam.pk]))

    assert response.status_code == 204
    assert not ExamType.objects.filter(pk=barista_exam.pk).exists()


@pytest.mark.django_db
def test_employee_cannot_delete_exam_type(employee_user, barista_exam):
    response = client_for(employee_user).delete(
        reverse("exams:type-detail", args=[barista_exam.pk])
    )

    assert response.status_code == 403
    assert ExamType.objects.filter(pk=barista_exam.pk).exists()


@pytest.mark.django_db
def test_hr_cannot_take_exams(hr_user, barista_exam):
    ExamAssignment.objects.create(exam_type=barista_exam, email="hr@example.com")
    client = client_for(hr_user)

    assert client.get(reverse("exams:my-exams")).status_code == 403
    assert client.post(reverse("exams:exam-start", args=[barista_exam.pk])).status_code == 403
    assert not ExamSession.objects.exists()


# --- Assignments ---


@pytest.mark.django_db
def test_assignment_email_is_normalized(hr_user, barista_exam):
    response = client_for(hr_user).post(
        reverse("exams:assignment-list", args=[barista_exam.pk]),
        {"email": "  Barista@Example.COM "},
    )

    assert response.status_code == 201
    assert response.json()["email"] == "barista@example.com"
    assert barista_exam.assignments.get().email == "barista@example.com"


@pytest.mark.django_db
def test_duplicate_assignment_rejected_but_other_exam_allowed(hr_user, barista_exam):
    other_exam = ExamType.objects.create(name="Bartender Exam")
    client = client_for(hr_user)
    url = reverse("exams:assignment-list", args=[barista_exam.pk])

    assert client.post(url, {"email": "barista@example.com"}).status_code == 201
    assert client.post(url, {"email": "BARISTA@example.com"}).status_code == 400
    assert (
        client.post(
            reverse("exams:assignment-list", args=[other_exam.pk]),
            {"email": "barista@example.com"},
        ).status_code
        == 201
    )


@pytest.mark.django_db
def test_assignment_works_for_email_without_user_account(hr_user, barista_exam):
    response = client_for(hr_user).post(
        reverse("exams:assignment-list", args=[barista_exam.pk]),
        {"email": "not.signed.up.yet@example.com"},
    )

    assert response.status_code == 201
    assert not User.objects.filter(email="not.signed.up.yet@example.com").exists()


# --- Employee visibility ---


@pytest.mark.django_db
def test_my_exams_lists_only_assigned_active_exams(employee_user, barista_exam):
    ExamAssignment.objects.create(exam_type=barista_exam, email="Barista@Example.com")
    retired = ExamType.objects.create(name="Retired Exam", is_active=False)
    ExamAssignment.objects.create(exam_type=retired, email="barista@example.com")
    other = ExamType.objects.create(name="Someone Else's Exam")
    ExamAssignment.objects.create(exam_type=other, email="other@example.com")

    response = client_for(employee_user).get(reverse("exams:my-exams"))

    assert response.status_code == 200
    names = [exam["name"] for exam in response.json()["results"]]
    assert names == ["Barista Exam"]


@pytest.mark.django_db
def test_assignment_before_signup_shows_after_user_created(barista_exam):
    ExamAssignment.objects.create(exam_type=barista_exam, email="late.signup@example.com")
    late_user = User.objects.create(
        username="late.signup@example.com", email="late.signup@example.com"
    )

    response = client_for(late_user).get(reverse("exams:my-exams"))

    assert [exam["name"] for exam in response.json()["results"]] == ["Barista Exam"]


@pytest.mark.django_db
def test_deleting_assignment_removes_exam_from_my_list(hr_user, employee_user, barista_exam):
    assignment = ExamAssignment.objects.create(exam_type=barista_exam, email="barista@example.com")

    delete_response = client_for(hr_user).delete(
        reverse("exams:assignment-delete", args=[barista_exam.pk, assignment.pk])
    )
    assert delete_response.status_code == 204

    response = client_for(employee_user).get(reverse("exams:my-exams"))
    assert response.json()["results"] == []


# --- Exam sessions ---


@pytest.mark.django_db
def test_start_exam_creates_session_and_is_idempotent(employee_user, barista_exam):
    ExamAssignment.objects.create(exam_type=barista_exam, email="barista@example.com")
    client = client_for(employee_user)
    url = reverse("exams:exam-start", args=[barista_exam.pk])

    first = client.post(url)
    assert first.status_code == 201
    assert first.json()["status"] == ExamSession.Status.IN_PROGRESS
    assert first.json()["exam_type"]["name"] == "Barista Exam"

    second = client.post(url)
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert ExamSession.objects.count() == 1


@pytest.mark.django_db
def test_start_unassigned_exam_returns_404(employee_user, barista_exam):
    response = client_for(employee_user).post(reverse("exams:exam-start", args=[barista_exam.pk]))

    assert response.status_code == 404
    assert ExamSession.objects.count() == 0


@pytest.mark.django_db
def test_exam_endpoints_require_authentication(barista_exam):
    client = APIClient()

    assert client.get(reverse("exams:my-exams")).status_code == 401
    assert client.post(reverse("exams:exam-start", args=[barista_exam.pk])).status_code == 401
