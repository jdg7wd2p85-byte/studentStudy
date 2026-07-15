package com.momuying.studentstudy.dream;

import java.time.LocalDate;

public record DreamRequest(
        Long childId,
        String content,
        Integer targetScore,
        LocalDate targetDate
) {
}
