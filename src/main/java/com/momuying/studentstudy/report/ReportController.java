package com.momuying.studentstudy.report;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reports")
public class ReportController {
    private final JdbcTemplate jdbcTemplate;

    public ReportController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/summary")
    public ApiResponse<Map<String, Object>> summary(@RequestParam(required = false) Long childId) {
        List<Object> args = new ArrayList<>();
        String childFilter = "";
        if (childId != null) {
            childFilter = " AND i.child_id = ?";
            args.add(childId);
        }

        Map<String, Object> overview = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS total_items,
                  COALESCE(SUM(CASE WHEN i.mastery_score < 90 THEN 1 ELSE 0 END), 0) AS weak_count,
                  COALESCE(SUM(CASE WHEN i.mastery_score >= 90 THEN 1 ELSE 0 END), 0) AS mastered_count,
                  COALESCE(SUM(i.total_review_count), 0) AS total_reviews,
                  COALESCE(ROUND(AVG(i.mastery_score)), 0) AS avg_mastery
                FROM learning_items i
                WHERE i.status <> 'ARCHIVED'
                """ + childFilter, args.toArray());

        List<Object> dueArgs = new ArrayList<>();
        dueArgs.add(Timestamp.valueOf(LocalDateTime.now().plusDays(1).toLocalDate().atStartOfDay()));
        String dueChildFilter = "";
        if (childId != null) {
            dueChildFilter = " AND i.child_id = ?";
            dueArgs.add(childId);
        }
        Long dueToday = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM learning_items i
                WHERE i.status <> 'ARCHIVED'
                  AND i.next_review_at <= ?
                """ + dueChildFilter, Long.class, dueArgs.toArray());

        List<Object> todayArgs = new ArrayList<>();
        todayArgs.add(Timestamp.valueOf(LocalDateTime.now().toLocalDate().atStartOfDay()));
        todayArgs.add(Timestamp.valueOf(LocalDateTime.now().plusDays(1).toLocalDate().atStartOfDay()));
        String todayChildFilter = "";
        if (childId != null) {
            todayChildFilter = " AND r.child_id = ?";
            todayArgs.add(childId);
        }
        Map<String, Object> todayReview = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS review_count,
                  COUNT(DISTINCT r.item_id) AS item_count,
                  COALESCE(SUM(CASE WHEN r.rating = 0 THEN 1 ELSE 0 END), 0) AS forgot_count,
                  COALESCE(SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END), 0) AS vague_count,
                  COALESCE(SUM(CASE WHEN r.rating = 2 THEN 1 ELSE 0 END), 0) AS ok_count,
                  COALESCE(SUM(CASE WHEN r.rating = 3 THEN 1 ELSE 0 END), 0) AS fluent_count,
                  COUNT(DISTINCT CASE WHEN r.after_mastery_score >= 90 THEN r.item_id END) AS mastered_count
                FROM review_records r
                WHERE r.reviewed_at >= ?
                  AND r.reviewed_at < ?
                """ + todayChildFilter, todayArgs.toArray());

        List<Map<String, Object>> statusBuckets = jdbcTemplate.queryForList("""
                SELECT 'forgot' AS status_key, '不会' AS status_name, COUNT(*) AS item_count
                FROM learning_items i
                JOIN review_records r ON r.id = (
                  SELECT rr.id FROM review_records rr WHERE rr.item_id = i.id ORDER BY rr.reviewed_at DESC, rr.id DESC LIMIT 1
                )
                WHERE i.status <> 'ARCHIVED' AND r.rating = 0
                """ + childFilter + """
                UNION ALL
                SELECT 'vague', '模糊', COUNT(*)
                FROM learning_items i
                JOIN review_records r ON r.id = (
                  SELECT rr.id FROM review_records rr WHERE rr.item_id = i.id ORDER BY rr.reviewed_at DESC, rr.id DESC LIMIT 1
                )
                WHERE i.status <> 'ARCHIVED' AND r.rating = 1
                """ + childFilter + """
                UNION ALL
                SELECT 'ok', '基本会', COUNT(*)
                FROM learning_items i
                JOIN review_records r ON r.id = (
                  SELECT rr.id FROM review_records rr WHERE rr.item_id = i.id ORDER BY rr.reviewed_at DESC, rr.id DESC LIMIT 1
                )
                WHERE i.status <> 'ARCHIVED' AND r.rating = 2
                """ + childFilter + """
                UNION ALL
                SELECT 'fluent', '熟练', COUNT(*)
                FROM learning_items i
                JOIN review_records r ON r.id = (
                  SELECT rr.id FROM review_records rr WHERE rr.item_id = i.id ORDER BY rr.reviewed_at DESC, rr.id DESC LIMIT 1
                )
                WHERE i.status <> 'ARCHIVED' AND r.rating = 3
                """ + childFilter, repeatArgs(args, 4));

        List<Map<String, Object>> modules = jdbcTemplate.queryForList("""
                SELECT
                  s.name AS subject_name,
                  c.name AS category_name,
                  COUNT(*) AS item_count,
                  COALESCE(SUM(i.total_review_count), 0) AS review_count,
                  COALESCE(SUM(CASE WHEN i.mastery_score < 90 THEN 1 ELSE 0 END), 0) AS weak_count,
                  COALESCE(ROUND(AVG(i.mastery_score)), 0) AS avg_mastery
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                JOIN subjects s ON s.id = i.subject_id
                WHERE i.status <> 'ARCHIVED'
                """ + childFilter + """
                GROUP BY s.name, c.name
                ORDER BY item_count DESC, review_count DESC
                LIMIT 20
                """, args.toArray());

        List<Object> dailyArgs = new ArrayList<>();
        dailyArgs.add(Timestamp.valueOf(LocalDateTime.now().minusDays(59).toLocalDate().atStartOfDay()));
        String dailyChildFilter = "";
        if (childId != null) {
            dailyChildFilter = " AND r.child_id = ?";
            dailyArgs.add(childId);
        }
        List<Map<String, Object>> dailyTrend = jdbcTemplate.queryForList("""
                SELECT
                  DATE(r.reviewed_at) AS review_date,
                  COUNT(*) AS review_count,
                  COUNT(DISTINCT r.item_id) AS item_count,
                  COUNT(DISTINCT CASE WHEN r.after_mastery_score >= 90 THEN r.item_id END) AS mastered_count
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                WHERE i.status <> 'ARCHIVED'
                  AND r.reviewed_at >= ?
                """ + dailyChildFilter + """
                GROUP BY DATE(r.reviewed_at)
                ORDER BY review_date DESC
                """, dailyArgs.toArray());

        List<Map<String, Object>> dailyCategories = jdbcTemplate.queryForList("""
                SELECT
                  DATE(r.reviewed_at) AS review_date,
                  s.name AS subject_name,
                  c.name AS category_name,
                  COUNT(DISTINCT r.item_id) AS item_count,
                  COUNT(*) AS review_count
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                JOIN subjects s ON s.id = i.subject_id
                JOIN item_categories c ON c.id = i.category_id
                WHERE i.status <> 'ARCHIVED'
                  AND r.reviewed_at >= ?
                """ + dailyChildFilter + """
                GROUP BY DATE(r.reviewed_at), s.name, c.name
                ORDER BY review_date DESC, item_count DESC, review_count DESC
                """, dailyArgs.toArray());

        return ApiResponse.ok(Map.of(
                "overview", overview,
                "dueToday", dueToday == null ? 0 : dueToday,
                "todayReview", todayReview,
                "statusBuckets", statusBuckets,
                "modules", modules,
                "dailyTrend", dailyTrend,
                "dailyCategories", dailyCategories
        ));
    }

    @GetMapping("/daily")
    public ApiResponse<Map<String, Object>> daily(
            @RequestParam LocalDate date,
            @RequestParam(required = false) Long childId
    ) {
        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end = date.plusDays(1).atStartOfDay();
        List<Object> reviewArgs = new ArrayList<>();
        reviewArgs.add(Timestamp.valueOf(start));
        reviewArgs.add(Timestamp.valueOf(end));
        String reviewChildFilter = "";
        if (childId != null) {
            reviewChildFilter = " AND r.child_id = ? ";
            reviewArgs.add(childId);
        }

        Map<String, Object> reviewSummary = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS review_count,
                  COUNT(DISTINCT r.item_id) AS item_count,
                  COALESCE(SUM(CASE WHEN r.rating = 0 THEN 1 ELSE 0 END), 0) AS forgot_count,
                  COALESCE(SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END), 0) AS vague_count,
                  COALESCE(SUM(CASE WHEN r.rating = 2 THEN 1 ELSE 0 END), 0) AS ok_count,
                  COALESCE(SUM(CASE WHEN r.rating = 3 THEN 1 ELSE 0 END), 0) AS fluent_count,
                  COUNT(DISTINCT CASE WHEN r.after_mastery_score >= 90 THEN r.item_id END) AS mastered_count
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                WHERE i.status <> 'ARCHIVED'
                  AND r.reviewed_at >= ?
                  AND r.reviewed_at < ?
                """ + reviewChildFilter, reviewArgs.toArray());

        List<Map<String, Object>> categorySummary = jdbcTemplate.queryForList("""
                SELECT
                  s.name AS subject_name,
                  c.name AS category_name,
                  COUNT(DISTINCT r.item_id) AS item_count,
                  COUNT(*) AS review_count,
                  COUNT(DISTINCT CASE WHEN r.after_mastery_score >= 90 THEN r.item_id END) AS mastered_count
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                JOIN subjects s ON s.id = i.subject_id
                JOIN item_categories c ON c.id = i.category_id
                WHERE i.status <> 'ARCHIVED'
                  AND r.reviewed_at >= ?
                  AND r.reviewed_at < ?
                """ + reviewChildFilter + """
                GROUP BY s.name, c.name
                ORDER BY item_count DESC, review_count DESC
                """, reviewArgs.toArray());

        List<Map<String, Object>> reviews = jdbcTemplate.queryForList("""
                SELECT
                  r.id,
                  r.item_id,
                  r.reviewed_at,
                  r.rating,
                  r.before_mastery_score,
                  r.after_mastery_score,
                  r.next_review_at,
                  i.title,
                  i.display_mode,
                  s.name AS subject_name,
                  c.name AS category_name
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                JOIN subjects s ON s.id = i.subject_id
                JOIN item_categories c ON c.id = i.category_id
                WHERE i.status <> 'ARCHIVED'
                  AND r.reviewed_at >= ?
                  AND r.reviewed_at < ?
                """ + reviewChildFilter + """
                ORDER BY r.reviewed_at DESC, r.id DESC
                LIMIT 200
                """, reviewArgs.toArray());

        List<Object> scheduleArgs = new ArrayList<>();
        scheduleArgs.add(java.sql.Date.valueOf(date));
        String scheduleChildFilter = "";
        if (childId != null) {
            scheduleChildFilter = " AND w.child_id = ? ";
            scheduleArgs.add(childId);
        }
        Map<String, Object> scheduleSummary = jdbcTemplate.queryForMap("""
                SELECT
                  COUNT(*) AS planned_count,
                  COALESCE(SUM(CASE WHEN w.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done_count,
                  COALESCE(SUM(CASE WHEN w.status <> 'DONE' THEN 1 ELSE 0 END), 0) AS pending_count
                FROM weekly_schedule_items w
                WHERE w.status <> 'ARCHIVED'
                  AND w.schedule_date = ?
                """ + scheduleChildFilter, scheduleArgs.toArray());

        List<Map<String, Object>> scheduleItems = jdbcTemplate.queryForList("""
                SELECT
                  w.id,
                  w.child_id,
                  ch.name AS child_name,
                  w.schedule_date,
                  w.title,
                  w.planned_start_time,
                  w.planned_end_time,
                  w.actual_start_at,
                  w.actual_end_at,
                  w.note,
                  w.status,
                  s.name AS subject_name,
                  c.name AS category_name
                FROM weekly_schedule_items w
                JOIN children ch ON ch.id = w.child_id
                LEFT JOIN subjects s ON s.id = w.subject_id
                LEFT JOIN item_categories c ON c.id = w.category_id
                WHERE w.status <> 'ARCHIVED'
                  AND w.schedule_date = ?
                """ + scheduleChildFilter + """
                ORDER BY w.planned_start_time, w.id
                """, scheduleArgs.toArray());

        return ApiResponse.ok(Map.of(
                "date", date,
                "reviewSummary", reviewSummary,
                "categorySummary", categorySummary,
                "reviews", reviews,
                "scheduleSummary", scheduleSummary,
                "scheduleItems", scheduleItems
        ));
    }

    @GetMapping("/reviews")
    public ApiResponse<List<Map<String, Object>>> reviews(
            @RequestParam(required = false) Long childId,
            @RequestParam(required = false) Long itemId
    ) {
        List<Object> args = new ArrayList<>();
        String childFilter = "";
        if (childId != null) {
            childFilter = " AND r.child_id = ? ";
            args.add(childId);
        }
        String itemFilter = "";
        if (itemId != null) {
            itemFilter = " AND r.item_id = ? ";
            args.add(itemId);
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT
                  r.id,
                  r.item_id,
                  r.reviewed_at,
                  r.rating,
                  r.before_mastery_score,
                  r.after_mastery_score,
                  r.before_stage,
                  r.after_stage,
                  r.next_review_at,
                  i.title,
                  i.display_mode,
                  c.name AS category_name,
                  s.name AS subject_name
                FROM review_records r
                JOIN learning_items i ON i.id = r.item_id
                JOIN item_categories c ON c.id = i.category_id
                JOIN subjects s ON s.id = i.subject_id
                WHERE i.status <> 'ARCHIVED'
                """ + childFilter + itemFilter + """
                ORDER BY r.reviewed_at DESC, r.id DESC
                LIMIT 100
                """, args.toArray());
        return ApiResponse.ok(rows);
    }

    private Object[] repeatArgs(List<Object> args, int times) {
        List<Object> repeated = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            repeated.addAll(args);
        }
        return repeated.toArray();
    }
}
