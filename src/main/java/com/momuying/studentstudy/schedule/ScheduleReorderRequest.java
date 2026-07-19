package com.momuying.studentstudy.schedule;

import java.util.List;

public record ScheduleReorderRequest(
        List<ScheduleOrderItem> items
) {
    public record ScheduleOrderItem(
            Long id,
            Integer weekDay,
            Integer sortOrder
    ) {
    }
}
