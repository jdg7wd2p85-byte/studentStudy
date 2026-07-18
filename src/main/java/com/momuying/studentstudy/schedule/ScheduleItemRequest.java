package com.momuying.studentstudy.schedule;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record ScheduleItemRequest(
        Long childId,
        LocalDate scheduleDate,
        Long subjectId,
        Long categoryId,
        String title,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime,
        LocalDateTime actualStartAt,
        LocalDateTime actualEndAt,
        String note
) {
}
