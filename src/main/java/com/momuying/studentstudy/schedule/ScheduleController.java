package com.momuying.studentstudy.schedule;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {
    private final JdbcTemplate jdbcTemplate;

    public ScheduleController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/week")
    public ApiResponse<Map<String, Object>> week(
            @RequestParam LocalDate weekStart,
            @RequestParam(required = false) Long childId
    ) {
        LocalDate weekEnd = weekStart.plusDays(7);
        List<Object> args = new ArrayList<>();
        args.add(Date.valueOf(weekStart));
        args.add(Date.valueOf(weekEnd));
        String childFilter = "";
        if (childId != null) {
            childFilter = " AND w.child_id = ?";
            args.add(childId);
        }

        List<Map<String, Object>> items = jdbcTemplate.queryForList("""
                SELECT
                  w.id,
                  w.child_id,
                  ch.name AS child_name,
                  w.schedule_date,
                  w.subject_id,
                  s.name AS subject_name,
                  w.category_id,
                  c.name AS category_name,
                  w.title,
                  w.planned_start_time,
                  w.planned_end_time,
                  w.actual_start_at,
                  w.actual_end_at,
                  w.note,
                  w.status,
                  w.created_at,
                  w.updated_at
                FROM weekly_schedule_items w
                JOIN children ch ON ch.id = w.child_id
                LEFT JOIN subjects s ON s.id = w.subject_id
                LEFT JOIN item_categories c ON c.id = w.category_id
                WHERE w.status <> 'ARCHIVED'
                  AND w.schedule_date >= ?
                  AND w.schedule_date < ?
                """ + childFilter + """
                ORDER BY w.schedule_date, w.planned_start_time, w.id
                """, args.toArray());

        Map<String, Object> summary = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS planned_count,
                  COALESCE(SUM(CASE WHEN w.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done_count,
                  COALESCE(SUM(CASE WHEN w.status <> 'DONE' THEN 1 ELSE 0 END), 0) AS pending_count
                FROM weekly_schedule_items w
                WHERE w.status <> 'ARCHIVED'
                  AND w.schedule_date >= ?
                  AND w.schedule_date < ?
                """ + childFilter, args.toArray());

        return ApiResponse.ok(Map.of(
                "weekStart", weekStart,
                "weekEnd", weekEnd.minusDays(1),
                "summary", summary,
                "items", items
        ));
    }

    @PostMapping("/items")
    public ApiResponse<Map<String, Object>> create(@RequestBody ScheduleItemRequest request) {
        if (request.childId() == null || request.scheduleDate() == null || isBlank(request.title())) {
            throw new IllegalArgumentException("请填写孩子、日期和课程内容");
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO weekly_schedule_items(
                      child_id, schedule_date, subject_id, category_id, title,
                      planned_start_time, planned_end_time, actual_start_at, actual_end_at, note, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setObject(1, request.childId());
            ps.setObject(2, Date.valueOf(request.scheduleDate()));
            ps.setObject(3, request.subjectId());
            ps.setObject(4, request.categoryId());
            ps.setString(5, request.title().trim());
            ps.setObject(6, toTime(request.plannedStartTime()));
            ps.setObject(7, toTime(request.plannedEndTime()));
            ps.setObject(8, toTimestamp(request.actualStartAt()));
            ps.setObject(9, toTimestamp(request.actualEndAt()));
            ps.setString(10, blankToNull(request.note()));
            return ps;
        }, keyHolder);

        Number id = keyHolder.getKey();
        return ApiResponse.ok(Map.of("id", id == null ? 0 : id.longValue()));
    }

    @PostMapping("/items/{id}/check")
    public ApiResponse<Map<String, Object>> check(@PathVariable Long id, @RequestBody ScheduleCheckRequest request) {
        boolean done = request.done() == null || request.done();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime actualStart = request.actualStartAt() == null && done ? now : request.actualStartAt();
        LocalDateTime actualEnd = request.actualEndAt() == null && done ? now : request.actualEndAt();

        jdbcTemplate.update("""
                UPDATE weekly_schedule_items
                SET status = ?,
                    actual_start_at = ?,
                    actual_end_at = ?,
                    note = COALESCE(?, note)
                WHERE id = ? AND status <> 'ARCHIVED'
                """,
                done ? "DONE" : "ACTIVE",
                toTimestamp(actualStart),
                toTimestamp(actualEnd),
                blankToNull(request.note()),
                id);
        return ApiResponse.ok(Map.of("id", id, "status", done ? "DONE" : "ACTIVE"));
    }

    @PostMapping("/items/{id}/update")
    public ApiResponse<Map<String, Object>> update(@PathVariable Long id, @RequestBody ScheduleCheckRequest request) {
        jdbcTemplate.update("""
                UPDATE weekly_schedule_items
                SET actual_start_at = ?,
                    actual_end_at = ?,
                    note = ?
                WHERE id = ? AND status <> 'ARCHIVED'
                """,
                toTimestamp(request.actualStartAt()),
                toTimestamp(request.actualEndAt()),
                blankToNull(request.note()),
                id);
        return ApiResponse.ok(Map.of("id", id));
    }

    @DeleteMapping("/items/{id}")
    public ApiResponse<Map<String, Object>> archive(@PathVariable Long id) {
        int updated = jdbcTemplate.update("""
                UPDATE weekly_schedule_items
                SET status = 'ARCHIVED'
                WHERE id = ?
                """, id);
        return ApiResponse.ok(Map.of("id", id, "deleted", updated));
    }

    private Time toTime(LocalTime value) {
        return value == null ? null : Time.valueOf(value);
    }

    private Timestamp toTimestamp(LocalDateTime value) {
        return value == null ? null : Timestamp.valueOf(value);
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
