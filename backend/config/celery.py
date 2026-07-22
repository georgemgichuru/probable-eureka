"""Celery application.

No tasks are defined yet — this only wires Celery to Django settings and Redis so a
worker can start. Feature apps will register tasks via ``@shared_task`` and autodiscovery.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("probable_eureka")

# All Celery config keys live in Django settings, namespaced with CELERY_.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Discover tasks.py modules in installed apps.
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
