"""Tests for Google sign-in and role-based access control.

Google ID token verification is mocked (via monkeypatch on ``verify_google_id_token``)
so tests don't depend on network access or real Google credentials.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from .models import User

GOOGLE_PAYLOAD = {
    "email": "new.user@example.com",
    "email_verified": True,
    "given_name": "New",
    "family_name": "User",
}


@pytest.fixture
def mock_google(monkeypatch):
    def _mock(payload=None):
        monkeypatch.setattr(
            "apps.users.views.verify_google_id_token",
            lambda token: payload or GOOGLE_PAYLOAD,
        )

    return _mock


@pytest.mark.django_db
def test_google_login_creates_new_user_as_employee(mock_google):
    mock_google()
    client = APIClient()

    response = client.post(reverse("users:google-login"), {"id_token": "fake"})

    assert response.status_code == 200
    body = response.json()
    assert "access" in body and "refresh" in body
    assert body["user"]["email"] == "new.user@example.com"
    assert body["user"]["role"] == User.Role.EMPLOYEE

    user = User.objects.get(email="new.user@example.com")
    assert user.role == User.Role.EMPLOYEE


@pytest.mark.django_db
def test_google_login_existing_user_keeps_role(mock_google):
    User.objects.create(
        username="existing@example.com",
        email="existing@example.com",
        role=User.Role.ADMIN,
    )
    mock_google(
        {
            "email": "existing@example.com",
            "email_verified": True,
            "given_name": "Existing",
            "family_name": "User",
        }
    )
    client = APIClient()

    response = client.post(reverse("users:google-login"), {"id_token": "fake"})

    assert response.status_code == 200
    assert response.json()["user"]["role"] == User.Role.ADMIN


@pytest.mark.django_db
def test_google_login_invalid_token_returns_400(monkeypatch):
    from rest_framework.exceptions import ValidationError

    def _raise(token):
        raise ValidationError("Invalid Google ID token")

    monkeypatch.setattr("apps.users.views.verify_google_id_token", _raise)
    client = APIClient()

    response = client.post(reverse("users:google-login"), {"id_token": "bad"})

    assert response.status_code == 400


@pytest.mark.django_db
def test_me_requires_authentication():
    client = APIClient()
    response = client.get(reverse("users:me"))
    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_current_user():
    user = User.objects.create(username="employee@example.com", email="employee@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(reverse("users:me"))

    assert response.status_code == 200
    assert response.json()["email"] == "employee@example.com"


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(mock_google):
    mock_google()
    client = APIClient()
    tokens = client.post(reverse("users:google-login"), {"id_token": "fake"}).json()

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    response = client.post(reverse("users:logout"), {"refresh": tokens["refresh"]})
    assert response.status_code == 204

    # The blacklisted refresh token can no longer mint access tokens.
    refresh_response = APIClient().post(
        reverse("users:token-refresh"), {"refresh": tokens["refresh"]}
    )
    assert refresh_response.status_code == 401


@pytest.mark.django_db
def test_logout_requires_authentication():
    response = APIClient().post(reverse("users:logout"), {"refresh": "whatever"})
    assert response.status_code == 401


@pytest.mark.django_db
def test_logout_with_garbage_refresh_token_still_succeeds():
    user = User.objects.create(username="employee@example.com", email="employee@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(reverse("users:logout"), {"refresh": "not-a-token"})

    assert response.status_code == 204


@pytest.mark.django_db
def test_user_list_forbidden_for_employee():
    user = User.objects.create(username="employee@example.com", email="employee@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(reverse("users:user-list"))

    assert response.status_code == 403


@pytest.mark.django_db
def test_user_list_allowed_for_admin():
    admin = User.objects.create(
        username="admin@example.com", email="admin@example.com", role=User.Role.ADMIN
    )
    client = APIClient()
    client.force_authenticate(user=admin)

    response = client.get(reverse("users:user-list"))

    assert response.status_code == 200


@pytest.mark.django_db
def test_email_suggestions_forbidden_for_employee():
    user = User.objects.create(username="employee@example.com", email="employee@example.com")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(reverse("users:email-suggestions"))

    assert response.status_code == 403


@pytest.mark.django_db
def test_email_suggestions_match_employees_only():
    examiner = User.objects.create(
        username="hr@example.com", email="hr@example.com", role=User.Role.EXAMINER
    )
    User.objects.create(username="ann@example.com", email="ann@example.com")
    User.objects.create(username="anders@example.com", email="anders@example.com")
    User.objects.create(username="bob@example.com", email="bob@example.com")
    # Same prefix but HR — must not be suggested as an examinee.
    User.objects.create(
        username="anna.admin@example.com",
        email="anna.admin@example.com",
        role=User.Role.ADMIN,
    )
    client = APIClient()
    client.force_authenticate(user=examiner)

    response = client.get(reverse("users:email-suggestions"), {"q": "an"})

    assert response.status_code == 200
    assert response.json() == ["anders@example.com", "ann@example.com"]


@pytest.mark.django_db
def test_role_update_forbidden_for_non_admin():
    employee = User.objects.create(username="employee@example.com", email="employee@example.com")
    target = User.objects.create(username="target@example.com", email="target@example.com")
    client = APIClient()
    client.force_authenticate(user=employee)

    response = client.patch(
        reverse("users:user-role-update", args=[target.id]), {"role": User.Role.ADMIN}
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_role_update_allowed_for_admin():
    admin = User.objects.create(
        username="admin@example.com", email="admin@example.com", role=User.Role.ADMIN
    )
    target = User.objects.create(username="target@example.com", email="target@example.com")
    client = APIClient()
    client.force_authenticate(user=admin)

    response = client.patch(
        reverse("users:user-role-update", args=[target.id]), {"role": User.Role.EXAMINER}
    )

    assert response.status_code == 200
    target.refresh_from_db()
    assert target.role == User.Role.EXAMINER
