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
            childFilter = " AND w.child_id = ? ";
            args.add(childId);
        }

        List<Map<String, Object>> items = jdbcTemplate.queryForList("""
                SELECT
                  w.id,
                  w.child_id,
                  ch.name AS child_name,
                  w.schedule_date,
                  COALESCE(w.week_day, ((DAYOFWEEK(w.schedule_date) + 5) % 7) + 1) AS week_day,
                  w.subject_id,
                  s.name AS subject_name,
                  w.category_id,
                  c.name AS category_name,
                  w.title,
                  w.planned_start_time,
                  w.planned_end_time,
                  w.note,
                  w.sort_order,
                  w.status,
                  ci.id AS checkin_id,
                  ci.check_date,
                  ci.actual_start_at,
                  ci.actual_end_at,
                  ci.note AS checkin_note,
                  ci.status AS checkin_status,
                  w.created_at,
                  w.updated_at
                FROM weekly_schedule_items w
                JOIN children ch ON ch.id = w.child_id
                LEFT JOIN subjects s ON s.id = w.subject_id
                LEFT JOIN item_categories c ON c.id = w.category_id
                LEFT JOIN schedule_checkins ci
                  ON ci.schedule_item_id = w.id
                  AND ci.check_date = DATE_ADD(?, INTERVAL (COALESCE(w.week_day, ((DAYOFWEEK(w.schedule_date) + 5) % 7) + 1) - 1) DAY)
                WHERE w.status <> 'ARCHIVED'
                  AND (w.schedule_date IS NULL OR w.schedule_date < ?)
                """ + childFilter + """
                ORDER BY COALESCE(w.week_day, ((DAYOFWEEK(w.schedule_date) + 5) % 7) + 1), w.sort_order, w.planned_start_time, w.id
                """, args.toArray());

        List<Object> summaryArgs = new ArrayList<>();
        summaryArgs.add(Date.valueOf(weekStart));
        summaryArgs.add(Date.valueOf(weekEnd));
        if (childId != null) {
            summaryArgs.add(childId);
        }
        Map<String, Object> summary = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS planned_count,
                  COALESCE(SUM(CASE WHEN ci.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done_count,
                  COUNT(*) - COALESCE(SUM(CASE WHEN ci.status = 'DONE' THEN 1 ELSE 0 END), 0) AS pending_count
                FROM weekly_schedule_items w
                LEFT JOIN schedule_checkins ci
                  ON ci.schedule_item_id = w.id
                  AND ci.check_date = DATE_ADD(?, INTERVAL (COALESCE(w.week_day, ((DAYOFWEEK(w.schedule_date) + 5) % 7) + 1) - 1) DAY)
                WHERE w.status <> 'ARCHIVED'
                  AND (w.schedule_date IS NULL OR w.schedule_date < ?)
                """ + childFilter, summaryArgs.toArray());

        return ApiResponse.ok(Map.of(
                "weekStart", weekStart,
                "weekEnd", weekEnd.minusDays(1),
                "summary", summary,
                "items", items
        ));
    }

    @PostMapping("/items")
    public ApiResponse<Map<String, Object>> create(@RequestBody ScheduleItemRequest request) {
        int weekDay = normalizedWeekDay(request.weekDay(), request.scheduleDate());
        if (request.childId() == null || isBlank(request.title())) {
            throw new IllegalArgumentException("请填写孩子、周几和课程内容");
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO weekly_schedule_items(
                      child_id, schedule_date, week_day, subject_id, category_id, title,
                      planned_start_time, planned_end_time, note, sort_order, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setObject(1, request.childId());
            ps.setObject(2, Date.valueOf(anchorDate(weekDay)));
            ps.setObject(3, weekDay);
            ps.setObject(4, request.subjectId());
            ps.setObject(5, request.categoryId());
            ps.setString(6, request.title().trim());
            ps.setObject(7, toTime(request.plannedStartTime()));
            ps.setObject(8, toTime(request.plannedEndTime()));
            ps.setString(9, blankToNull(request.note()));
            ps.setObject(10, request.sortOrder() == null ? 0 : request.sortOrder());
            return ps;
        }, keyHolder);

        Number id = keyHolder.getKey();
        return ApiResponse.ok(Map.of("id", id == null ? 0 : id.longValue()));
    }

    @PostMapping("/items/{id}/check")
    public ApiResponse<Map<String, Object>> check(@PathVariable Long id, @RequestBody ScheduleCheckRequest request) {
        boolean done = request.done() == null || request.done();
        if (request.checkDate() == null) {
            throw new IllegalArgumentException("请选择打卡日期");
        }
        Long childId = jdbcTemplate.queryForObject("""
                SELECT child_id
                FROM weekly_schedule_items
                WHERE id = ? AND status <> 'ARCHIVED'
                """, Long.class, id);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime actualStart = request.actualStartAt() == null && done ? now : request.actualStartAt();
        LocalDateTime actualEnd = request.actualEndAt() == null && done ? now : request.actualEndAt();

        jdbcTemplate.update("""
                INSERT INTO schedule_checkins(
                  schedule_item_id, child_id, check_date, actual_start_at, actual_end_at, note, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  actual_start_at = VALUES(actual_start_at),
                  actual_end_at = VALUES(actual_end_at),
                  note = VALUES(note),
                  status = VALUES(status)
                """,
                id,
                childId,
                Date.valueOf(request.checkDate()),
                toTimestamp(actualStart),
                toTimestamp(actualEnd),
                blankToNull(request.note()),
                done ? "DONE" : "ACTIVE");
        return ApiResponse.ok(Map.of("id", id, "status", done ? "DONE" : "ACTIVE"));
    }

    @PostMapping("/items/{id}/update")
    public ApiResponse<Map<String, Object>> update(@PathVariable Long id, @RequestBody ScheduleCheckRequest request) {
        if (request.checkDate() == null) {
            throw new IllegalArgumentException("请选择打卡日期");
        }
        Long childId = jdbcTemplate.queryForObject("""
                SELECT child_id
                FROM weekly_schedule_items
                WHERE id = ? AND status <> 'ARCHIVED'
                """, Long.class, id);
        jdbcTemplate.update("""
                INSERT INTO schedule_checkins(
                  schedule_item_id, child_id, check_date, actual_start_at, actual_end_at, note, status
                )
                VALUES (?, ?, ?, ?, ?, ?, 'DONE')
                ON DUPLICATE KEY UPDATE
                  actual_start_at = VALUES(actual_start_at),
                  actual_end_at = VALUES(actual_end_at),
                  note = VALUES(note),
                  status = VALUES(status)
                """,
                id,
                childId,
                Date.valueOf(request.checkDate()),
                toTimestamp(request.actualStartAt()),
                toTimestamp(request.actualEndAt()),
                blankToNull(request.note()));
        return ApiResponse.ok(Map.of("id", id));
    }

    @PostMapping("/items/{id}/copy")
    public ApiResponse<Map<String, Object>> copy(@PathVariable Long id, @RequestBody ScheduleCopyRequest request) {
        int targetWeekDay = normalizedWeekDay(request.targetWeekDay(), null);
        Map<String, Object> item = jdbcTemplate.queryForMap("""
                SELECT child_id, subject_id, category_id, title, planned_start_time, planned_end_time, note, sort_order
                FROM weekly_schedule_items
                WHERE id = ? AND status <> 'ARCHIVED'
                """, id);
        jdbcTemplate.update("""
                INSERT INTO weekly_schedule_items(
                  child_id, schedule_date, week_day, subject_id, category_id, title,
                  planned_start_time, planned_end_time, note, sort_order, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                """,
                item.get("child_id"),
                Date.valueOf(anchorDate(targetWeekDay)),
                targetWeekDay,
                item.get("subject_id"),
                item.get("category_id"),
                item.get("title"),
                item.get("planned_start_time"),
                item.get("planned_end_time"),
                item.get("note"),
                item.get("sort_order"));
        return ApiResponse.ok(Map.of("copied", 1, "targetWeekDay", targetWeekDay));
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

    private int normalizedWeekDay(Integer weekDay, LocalDate fallbackDate) {
        if (weekDay != null && weekDay >= 1 && weekDay <= 7) return weekDay;
        if (fallbackDate != null) return fallbackDate.getDayOfWeek().getValue();
        throw new IllegalArgumentException("请选择周几");
    }

    private LocalDate anchorDate(int weekDay) {
        return LocalDate.of(2000, 1, 3).plusDays(weekDay - 1L);
    }
}
