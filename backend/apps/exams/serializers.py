from rest_framework import serializers

from .models import ExamAssignment, ExamSession, ExamType


class ExamTypeSerializer(serializers.ModelSerializer):
    """Full representation for HR management endpoints."""

    # Explicit default so form-encoded POSTs without the field still create active
    # exams (DRF reads a missing boolean in form data as False).
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = ExamType
        fields = ["id", "name", "description", "is_active", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class ExamTypeEmployeeSerializer(serializers.ModelSerializer):
    """Slim read-only view for employees picking their exam."""

    class Meta:
        model = ExamType
        fields = ["id", "name", "description"]
        read_only_fields = fields


class ExamAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAssignment
        fields = ["id", "email", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate(self, attrs):
        exam_type = self.context["exam_type"]
        if ExamAssignment.objects.filter(exam_type=exam_type, email=attrs["email"]).exists():
            raise serializers.ValidationError(
                {"email": "This email is already assigned to this exam."}
            )
        return attrs


class ExamSessionSerializer(serializers.ModelSerializer):
    exam_type = ExamTypeEmployeeSerializer(read_only=True)

    class Meta:
        model = ExamSession
        fields = ["id", "exam_type", "status", "started_at"]
        read_only_fields = fields
