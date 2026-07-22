from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.exams.models import ExamType
from apps.users.permissions import IsExaminer

from .models import Question, QuestionImportJob
from .serializers import (
    QuestionImportCreateSerializer,
    QuestionImportJobSerializer,
    QuestionSerializer,
)
from .services import next_position
from .tasks import process_question_import


class ExamTypeScopedMixin:
    """Resolves the parent exam type from the ``pk`` URL kwarg (404 if absent)."""

    @property
    def exam_type(self) -> ExamType:
        return get_object_or_404(ExamType, pk=self.kwargs["pk"])


class QuestionListCreateView(ExamTypeScopedMixin, generics.ListCreateAPIView):
    serializer_class = QuestionSerializer
    permission_classes = [IsExaminer]

    def get_queryset(self):
        return Question.objects.filter(exam_type_id=self.kwargs["pk"])

    def perform_create(self, serializer):
        exam_type = self.exam_type
        serializer.save(
            exam_type=exam_type,
            created_by=self.request.user,
            position=serializer.validated_data.get("position") or next_position(exam_type.pk),
        )


class QuestionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = QuestionSerializer
    permission_classes = [IsExaminer]
    lookup_url_kwarg = "question_pk"

    def get_queryset(self):
        return Question.objects.filter(exam_type_id=self.kwargs["pk"])


class QuestionImportCreateView(ExamTypeScopedMixin, APIView):
    """Accept a bulk paste of questions and hand it to the worker queue.

    Returns 202 immediately with the job to poll — the request never waits on
    parsing, so examiners stay unblocked however large the import.
    """

    permission_classes = [IsExaminer]

    def post(self, request, pk):
        serializer = QuestionImportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        job = QuestionImportJob.objects.create(
            exam_type=self.exam_type,
            source_text=serializer.validated_data["text"],
            created_by=request.user,
        )
        # Enqueue only after the row is committed so a fast worker can't miss it.
        transaction.on_commit(lambda: process_question_import.delay(job.pk))

        return Response(QuestionImportJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class QuestionImportDetailView(generics.RetrieveAPIView):
    serializer_class = QuestionImportJobSerializer
    permission_classes = [IsExaminer]
    lookup_url_kwarg = "job_pk"

    def get_queryset(self):
        return QuestionImportJob.objects.filter(exam_type_id=self.kwargs["pk"])
