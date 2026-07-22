from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsExaminer

from .models import ExamAssignment, ExamType
from .serializers import (
    ExamAssignmentSerializer,
    ExamSessionSerializer,
    ExamTypeEmployeeSerializer,
    ExamTypeSerializer,
)
from .services import assigned_exam_types_for, start_exam_session

# --- HR (admin / examiner) endpoints ---


class ExamTypeListCreateView(generics.ListCreateAPIView):
    queryset = ExamType.objects.all()
    serializer_class = ExamTypeSerializer
    permission_classes = [IsExaminer]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ExamTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ExamType.objects.all()
    serializer_class = ExamTypeSerializer
    permission_classes = [IsExaminer]


class ExamAssignmentListCreateView(generics.ListCreateAPIView):
    serializer_class = ExamAssignmentSerializer
    permission_classes = [IsExaminer]

    @property
    def exam_type(self) -> ExamType:
        return get_object_or_404(ExamType, pk=self.kwargs["pk"])

    def get_queryset(self):
        return self.exam_type.assignments.order_by("email")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["exam_type"] = self.exam_type
        return context

    def perform_create(self, serializer):
        serializer.save(exam_type=self.exam_type, assigned_by=self.request.user)


class ExamAssignmentDeleteView(generics.DestroyAPIView):
    permission_classes = [IsExaminer]
    lookup_url_kwarg = "assignment_pk"

    def get_queryset(self):
        return ExamAssignment.objects.filter(exam_type_id=self.kwargs["pk"])


# --- Employee endpoints (default IsAuthenticated) ---


class MyExamTypeListView(generics.ListAPIView):
    """Exam types assigned to the signed-in user's email."""

    serializer_class = ExamTypeEmployeeSerializer

    def get_queryset(self):
        return assigned_exam_types_for(self.request.user)


class ExamSessionStartView(APIView):
    """Enter the selected exam. The "did you pick the right exam?" warning is a
    frontend concern; this endpoint just records the session."""

    def post(self, request, pk):
        session, created = start_exam_session(request.user, pk)
        return Response(
            ExamSessionSerializer(session).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
