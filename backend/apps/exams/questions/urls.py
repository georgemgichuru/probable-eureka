from django.urls import path

from . import views

app_name = "exam_questions"

urlpatterns = [
    path(
        "types/<int:pk>/questions/",
        views.QuestionListCreateView.as_view(),
        name="question-list",
    ),
    path(
        "types/<int:pk>/questions/<int:question_pk>/",
        views.QuestionDetailView.as_view(),
        name="question-detail",
    ),
    path(
        "types/<int:pk>/questions/import/",
        views.QuestionImportCreateView.as_view(),
        name="question-import",
    ),
    path(
        "types/<int:pk>/questions/imports/<int:job_pk>/",
        views.QuestionImportDetailView.as_view(),
        name="question-import-detail",
    ),
]
