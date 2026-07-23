from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role"]
        read_only_fields = fields


class GoogleAuthSerializer(serializers.Serializer):
    id_token = serializers.CharField()


class RoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.Role.choices)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
