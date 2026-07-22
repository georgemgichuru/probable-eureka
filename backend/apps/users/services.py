"""Google ID token verification and user provisioning.

Kept separate from views.py so the verification/lookup logic is easy to unit test
and to mock in view-level tests without hitting Google's network endpoints.
"""

from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework.exceptions import ValidationError

from .models import User


def verify_google_id_token(token: str) -> dict:
    """Verify a Google ID token and return its decoded payload.

    Raises ``ValidationError`` (DRF) on any failure so callers can surface a clean
    400 response without needing to know about google-auth's exception types.
    """
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise ValidationError("Google sign-in is not configured: GOOGLE_OAUTH_CLIENT_ID is unset.")

    try:
        payload = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as exc:
        raise ValidationError(f"Invalid Google ID token: {exc}") from exc

    if not payload.get("email_verified"):
        raise ValidationError("Google account email is not verified.")

    return payload


def get_or_create_user_from_google(payload: dict) -> User:
    """Find the user matching the Google payload's email, creating one if needed.

    New users default to ``Role.EMPLOYEE`` (the model default). Existing users keep
    their assigned role untouched — only their name is refreshed from Google.
    """
    email = payload["email"]
    first_name = payload.get("given_name", "")
    last_name = payload.get("family_name", "")

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": email,
            "first_name": first_name,
            "last_name": last_name,
        },
    )

    if not created:
        user.first_name = first_name
        user.last_name = last_name
        user.save(update_fields=["first_name", "last_name"])

    return user
