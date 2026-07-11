package com.momuying.studentstudy.learning.dto;

import java.util.List;
import java.util.Map;

public record CreateItemRequest(
        Long childId,
        Long subjectId,
        Long categoryId,
        String itemType,
        String displayMode,
        String title,
        String prompt,
        String content,
        String answer,
        String explanation,
        String source,
        List<String> tags,
        Map<String, Object> extraFields
) {
}
