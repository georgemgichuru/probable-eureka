"""DRF permission classes built on ``User.role``."""

from rest_framework.permissions import BasePermission

from .models import User


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(
            request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN
        )


class IsEmployee(BasePermission):
    """Employees only — HR staff (examiners/admins) run exams, they don't sit them."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.EMPLOYEE
        )


class IsExaminer(BasePermission):
    """Examiners and admins (admins outrank examiners everywhere)."""

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_examiner)
