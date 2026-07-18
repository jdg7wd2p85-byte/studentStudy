package com.momuying.studentstudy.schedule;

import java.time.LocalDateTime;

public record ScheduleCheckRequest(
        Boolean done,
        LocalDateTime actualStartAt,
        LocalDateTime actualEndAt,
        String note
) {
}
