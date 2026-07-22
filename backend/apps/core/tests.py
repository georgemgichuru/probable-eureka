"""Tests for the health endpoint.

Uses django's LocMemCache override so the Redis check passes without a live Redis
instance during unit tests; the database check runs against the test database.
"""

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

LOCMEM_CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


@pytest.mark.django_db
@override_settings(CACHES=LOCMEM_CACHE)
def test_health_ok():
    client = APIClient()
    response = client.get(reverse("core:health"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["redis"] == "ok"
