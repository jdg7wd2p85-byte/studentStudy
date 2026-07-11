package com.momuying.studentstudy.learning.dto;

import java.util.List;
import java.util.Map;

public record ParsedItem(
        String rawText,
        String categoryCode,
        String displayMode,
        String title,
        String prompt,
        String content,
        String answer,
        String explanation,
        List<String> tags,
        Map<String, Object> extraFields,
        double confidence,
        List<String> warnings
) {
}
