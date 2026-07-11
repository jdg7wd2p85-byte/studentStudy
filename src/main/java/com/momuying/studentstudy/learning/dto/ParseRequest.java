package com.momuying.studentstudy.learning.dto;

public record ParseRequest(
        Long childId,
        Long subjectId,
        Long categoryId,
        String categoryCode,
        String rawText,
        String source,
        String tags
) {
}
