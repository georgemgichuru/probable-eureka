"""Health check.

Reports liveness of the app plus its two critical dependencies (Postgres, Redis) so
the whole stack can be verified with a single request and so orchestrators / load
balancers have something to probe.
"""

from django.core.cache import cache
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _check_database() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception:
        return False


def _check_redis() -> bool:
    try:
        cache.set("healthcheck", "ok", timeout=5)
        return cache.get("healthcheck") == "ok"
    except Exception:
        return False


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    db_ok = _check_database()
    redis_ok = _check_redis()
    healthy = db_ok and redis_ok

    payload = {
        "status": "ok" if healthy else "degraded",
        "db": "ok" if db_ok else "error",
        "redis": "ok" if redis_ok else "error",
    }
    http_status = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response(payload, status=http_status)
