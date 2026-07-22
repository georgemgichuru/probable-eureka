from django.urls import include, path

from . import views

app_name = "exams"

urlpatterns = [
    # Submodules mount their routes here so the whole exam surface stays under
    # /api/exams/ no matter how many are added.
    path("", include("apps.exams.questions.urls")),
    # HR management
    path("types/", views.ExamTypeListCreateView.as_view(), name="type-list"),
    path("types/<int:pk>/", views.ExamTypeDetailView.as_view(), name="type-detail"),
    path(
        "types/<int:pk>/assignments/",
        views.ExamAssignmentListCreateView.as_view(),
        name="assignment-list",
    ),
    path(
        "types/<int:pk>/assignments/<int:assignment_pk>/",
        views.ExamAssignmentDeleteView.as_view(),
        name="assignment-delete",
    ),
    # Employee-facing
    path("my/", views.MyExamTypeListView.as_view(), name="my-exams"),
    path("my/<int:pk>/start/", views.ExamSessionStartView.as_view(), name="exam-start"),
]
