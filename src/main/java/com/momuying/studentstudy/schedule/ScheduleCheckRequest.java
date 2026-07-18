package com.momuying.studentstudy.schedule;

import java.time.LocalDateTime;
import java.time.LocalDate;

public record ScheduleCheckRequest(
        Boolean done,
        LocalDate checkDate,
        LocalDateTime actualStartAt,
        LocalDateTime actualEndAt,
        String note
) {
}
