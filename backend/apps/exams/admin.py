from django.contrib import admin

from .models import ExamAssignment, ExamSession, ExamType


class ExamAssignmentInline(admin.TabularInline):
    model = ExamAssignment
    extra = 0
    fields = ("email", "assigned_by", "created_at")
    readonly_fields = ("created_at",)


@admin.register(ExamType)
class ExamTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_by", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    inlines = [ExamAssignmentInline]


@admin.register(ExamSession)
class ExamSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "exam_type", "status", "started_at")
    list_filter = ("status", "exam_type")
