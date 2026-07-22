"""Query and workflow logic for exams, kept out of views for easy testing."""

from django.db.models import QuerySet
from rest_framework.exceptions import NotFound

from .models import ExamSession, ExamType


def assigned_exam_types_for(user) -> "QuerySet[ExamType]":
    """Active exam types the user may take, matched by their (lowercased) email."""
    return ExamType.objects.filter(is_active=True, assignments__email=user.email.lower()).distinct()


def start_exam_session(user, exam_type_id: int) -> tuple[ExamSession, bool]:
    """Start (or resume) the user's session for an assigned exam type.

    Raises ``NotFound`` when the exam type doesn't exist or isn't assigned to the
    user — a 404 in both cases so the API doesn't leak which exams exist.
    Idempotent: an existing in-progress session is returned instead of duplicated.
    """
    try:
        exam_type = assigned_exam_types_for(user).get(pk=exam_type_id)
    except ExamType.DoesNotExist as exc:
        raise NotFound("Exam not found.") from exc

    return ExamSession.objects.get_or_create(
        exam_type=exam_type,
        user=user,
        status=ExamSession.Status.IN_PROGRESS,
    )
