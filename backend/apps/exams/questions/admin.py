from django.contrib import admin

from .models import Question, QuestionImportJob


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("exam_type", "position", "short_text", "created_by", "updated_at")
    list_filter = ("exam_type",)
    search_fields = ("text",)

    @admin.display(description="Question")
    def short_text(self, obj: Question) -> str:
        return obj.text[:80]


@admin.register(QuestionImportJob)
class QuestionImportJobAdmin(admin.ModelAdmin):
    list_display = ("exam_type", "status", "created_count", "created_by", "created_at")
    list_filter = ("status", "exam_type")
    readonly_fields = ("source_text", "status", "created_count", "error", "finished_at")
