"""Production settings.

Everything sensitive comes from the environment. DEBUG is off, hosts and CORS
origins must be provided explicitly.
"""

from .base import *  # noqa: F401,F403

DEBUG = False

# Security hardening (encryption in transit is terminated at the edge/CDN;
# these headers assume TLS in front of the app).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
