"""Root URL configuration.

Only infrastructure endpoints are wired here for now. Feature apps will add their
own routers under ``/api/`` as they are built.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.users.urls")),
    path("api/exams/", include("apps.exams.urls")),
]
