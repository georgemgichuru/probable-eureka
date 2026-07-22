"""Celery tasks for the questions submodule.

Workers pick these up from the shared Redis queue; add workers with
``docker compose up --scale worker=N`` when import volume grows.
"""

from celery import shared_task

from .models import QuestionImportJob
from .services import run_import


@shared_task
def process_question_import(job_id: int) -> None:
    try:
        job = QuestionImportJob.objects.get(pk=job_id)
    except QuestionImportJob.DoesNotExist:
        return  # Job was deleted before the worker got to it.
    run_import(job)
