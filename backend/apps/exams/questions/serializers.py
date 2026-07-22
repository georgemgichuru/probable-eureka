from rest_framework import serializers

from .models import Question, QuestionImportJob


class QuestionSerializer(serializers.ModelSerializer):
    choices = serializers.ListField(
        child=serializers.CharField(max_length=500, allow_blank=False),
        min_length=2,
    )
    # Optional on write: omitted means "append at the end" (assigned in the view).
    position = serializers.IntegerField(required=False, min_value=1)

    class Meta:
        model = Question
        fields = ["id", "text", "choices", "correct_index", "position", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # On PATCH, fall back to the instance for whichever field wasn't sent.
        choices = attrs.get("choices", self.instance.choices if self.instance else None)
        correct_index = attrs.get(
            "correct_index", self.instance.correct_index if self.instance else None
        )
        if choices is not None and correct_index is not None and correct_index >= len(choices):
            raise serializers.ValidationError(
                {"correct_index": "correct_index must point at one of the choices."}
            )
        return attrs


class QuestionImportCreateSerializer(serializers.Serializer):
    text = serializers.CharField(allow_blank=False)


class QuestionImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionImportJob
        fields = ["id", "status", "created_count", "error", "created_at", "finished_at"]
        read_only_fields = fields
