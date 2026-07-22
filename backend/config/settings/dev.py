"""Development settings."""

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Permit the Vite dev server and the local nginx edge by default.
CORS_ALLOWED_ORIGINS = env(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:5173",
        "http://localhost",
        "http://127.0.0.1:5173",
    ],
)

# Browsable API is convenient locally.
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"].append(  # noqa: F405
    "rest_framework.renderers.BrowsableAPIRenderer"
)
