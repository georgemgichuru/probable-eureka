"""Exam catalogue: exam types, email-based assignments, and exam sessions.

Assignments are keyed on email (not a user FK) because HR adds examinees before
they have ever signed in with Google — the match to a real ``User`` happens at
read time via the signed-in user's email.
"""

from django.conf import settings
from django.db import models


class ExamType(models.Model):
    """An exam HR can offer, e.g. "Barista Exam"."""

    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    # Soft retire instead of delete so historical sessions keep their FK target.
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_exam_types",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ExamAssignment(models.Model):
    """Grants the holder of ``email`` access to take ``exam_type``.

    The email may not correspond to an existing ``User`` yet.
    """

    exam_type = models.ForeignKey(ExamType, on_delete=models.CASCADE, related_name="assignments")
    email = models.EmailField()
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["exam_type", "email"], name="unique_assignment_per_exam_email"
            )
        ]
        indexes = [models.Index(fields=["email"], name="exam_assignment_email_idx")]

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.email} -> {self.exam_type}"


class ExamSession(models.Model):
    """A single attempt at an exam. Future submodules (questions, grading,
    results) hang their data off this record."""

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    exam_type = models.ForeignKey(ExamType, on_delete=models.CASCADE, related_name="sessions")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exam_sessions"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)
    started_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # One active attempt at a time; completed sessions don't block retakes.
            models.UniqueConstraint(
                fields=["exam_type", "user"],
                condition=models.Q(status="in_progress"),
                name="one_active_session_per_user_exam",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} / {self.exam_type} ({self.status})"
