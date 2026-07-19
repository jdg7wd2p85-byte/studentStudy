package com.momuying.studentstudy.schedule;

public record ScheduleDayCopyRequest(
        Long childId,
        Integer sourceWeekDay,
        Integer targetWeekDay
) {
}
