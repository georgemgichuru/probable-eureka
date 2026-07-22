"""Custom user model.

Defined up front so ``AUTH_USER_MODEL`` is stable before the first migration.
Authentication flows (Google sign-in, signup) are intentionally NOT implemented yet —
this only establishes the identity table and the examiner/employee role distinction
described in the system requirements.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        EXAMINER = "examiner", "Examiner / HR"
        EMPLOYEE = "employee", "Employee / Examinee"

    # Unique so Google sign-in can reliably key account lookup/creation on email.
    email = models.EmailField("email address", unique=True)

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.EMPLOYEE,
        help_text="Determines role-based access. Managed by admins / a provisioning script.",
    )

    def __str__(self) -> str:
        return f"{self.get_username()} ({self.role})"

    @property
    def is_examiner(self) -> bool:
        return self.role in {self.Role.EXAMINER, self.Role.ADMIN}
