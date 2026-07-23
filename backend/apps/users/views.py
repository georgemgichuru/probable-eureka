from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .permissions import IsAdmin, IsExaminer
from .serializers import (
    GoogleAuthSerializer,
    LogoutSerializer,
    RoleUpdateSerializer,
    UserSerializer,
)
from .services import get_or_create_user_from_google, verify_google_id_token


class GoogleLoginView(APIView):
    """Exchange a Google ID token for an app-issued JWT pair."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = verify_google_id_token(serializer.validated_data["id_token"])
        user = get_or_create_user_from_google(payload)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class LogoutView(APIView):
    """Blacklist the caller's refresh token so the session can't be revived."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            # Already expired or blacklisted — the goal (a dead session) is met.
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserListView(generics.ListAPIView):
    queryset = User.objects.all().order_by("email")
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]


class EmailSuggestionView(APIView):
    """Autocomplete for the exam roster: employee emails matching ``?q=``.

    Open to examiners (not just admins) because they build rosters too; scoped
    to employees since HR staff never sit exams.
    """

    permission_classes = [IsExaminer]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        emails = User.objects.filter(role=User.Role.EMPLOYEE)
        if query:
            emails = emails.filter(email__icontains=query)
        return Response(list(emails.order_by("email").values_list("email", flat=True)[:10]))


class UserRoleUpdateView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = RoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.role = serializer.validated_data["role"]
        user.save(update_fields=["role"])
        return Response(UserSerializer(user).data)
