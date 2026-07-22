"""Parsing and import logic for exam questions, kept out of views and tasks."""

from dataclasses import dataclass

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import Question, QuestionImportJob


@dataclass
class ParsedQuestion:
    text: str
    choices: list[str]
    correct_index: int


class ImportFormatError(ValueError):
    """The pasted text doesn't follow the block format; message is user-facing."""


def parse_question_blocks(source: str) -> list[ParsedQuestion]:
    """Parse the bulk-import format into questions.

    Format: questions are separated by blank lines. In each block the first
    line is the question text and every following line is a choice; exactly
    one choice is prefixed with ``*`` to mark it correct::

        What is the ideal espresso extraction time?
        10-15 seconds
        *25-30 seconds
        45-60 seconds
    """
    blocks = [block.strip() for block in source.replace("\r\n", "\n").split("\n\n")]
    parsed: list[ParsedQuestion] = []

    for number, block in enumerate((b for b in blocks if b), start=1):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        text, choice_lines = lines[0], lines[1:]

        if len(choice_lines) < 2:
            raise ImportFormatError(
                f"Question {number} ({text[:50]!r}) needs at least two choice lines."
            )

        choices: list[str] = []
        correct_index: int | None = None
        for line in choice_lines:
            if line.startswith("*"):
                if correct_index is not None:
                    raise ImportFormatError(
                        f"Question {number} ({text[:50]!r}) marks more than one choice with *."
                    )
                correct_index = len(choices)
                line = line[1:].strip()
            if not line:
                raise ImportFormatError(f"Question {number} ({text[:50]!r}) has an empty choice.")
            choices.append(line)

        if correct_index is None:
            raise ImportFormatError(
                f"Question {number} ({text[:50]!r}) has no choice marked correct with *."
            )

        parsed.append(ParsedQuestion(text=text, choices=choices, correct_index=correct_index))

    if not parsed:
        raise ImportFormatError("No questions found. Separate questions with a blank line.")

    return parsed


def next_position(exam_type_id: int) -> int:
    current = Question.objects.filter(exam_type_id=exam_type_id).aggregate(Max("position"))
    return (current["position__max"] or 0) + 1


def run_import(job: QuestionImportJob) -> None:
    """Execute an import job: parse the source and insert the questions.

    Runs on a Celery worker. All outcomes (including bad input) end in a
    terminal job status the examiner can poll — never an unhandled exception.
    """
    job.status = QuestionImportJob.Status.PROCESSING
    job.save(update_fields=["status"])

    try:
        parsed = parse_question_blocks(job.source_text)
        with transaction.atomic():
            start = next_position(job.exam_type_id)
            Question.objects.bulk_create(
                Question(
                    exam_type_id=job.exam_type_id,
                    text=item.text,
                    choices=item.choices,
                    correct_index=item.correct_index,
                    position=start + offset,
                    created_by=job.created_by,
                )
                for offset, item in enumerate(parsed)
            )
        job.created_count = len(parsed)
        job.status = QuestionImportJob.Status.DONE
    except ImportFormatError as exc:
        job.status = QuestionImportJob.Status.FAILED
        job.error = str(exc)
    except Exception:
        job.status = QuestionImportJob.Status.FAILED
        job.error = "Import failed unexpectedly. Try again or contact support."
        raise
    finally:
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "created_count", "error", "finished_at"])
