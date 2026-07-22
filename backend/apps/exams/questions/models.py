"""Exam authoring: questions per exam type, plus queued bulk imports.

First submodule of ``apps.exams``. Questions are individual rows (not one big
document) so several examiners can author the same exam concurrently without
overwriting each other — edits touch only the row being edited. Bulk imports
are processed by Celery workers, so authoring throughput scales by adding
workers (``docker compose up --scale worker=N``) rather than blocking requests.
"""

from django.conf import settings
from django.db import models


class Question(models.Model):
    """One multiple-choice question belonging to an exam type."""

    exam_type = models.ForeignKey(
        "exams.ExamType", on_delete=models.CASCADE, related_name="questions"
    )
    text = models.TextField()
    # List of choice strings; ``correct_index`` points into it.
    choices = models.JSONField(default=list)
    correct_index = models.PositiveSmallIntegerField()
    # Display order within the exam. Deliberately NOT unique: two examiners
    # appending at the same time may land on the same position, and a tie is
    # harmless (ordering falls back to id) while a constraint would fail one
    # of them.
    position = models.PositiveIntegerField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["exam_type", "position"], name="question_exam_pos_idx")]

    def __str__(self) -> str:
        return f"[{self.exam_type}] Q{self.position}: {self.text[:40]}"


class QuestionImportJob(models.Model):
    """A bulk paste of questions, parsed and inserted by a Celery worker.

    The request only records the job and enqueues it, so the examiner's UI
    stays responsive no matter how large the paste or how busy the system is;
    they poll the job for progress.
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    exam_type = models.ForeignKey(
        "exams.ExamType", on_delete=models.CASCADE, related_name="import_jobs"
    )
    source_text = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    created_count = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Import #{self.pk} for {self.exam_type} ({self.status})"
