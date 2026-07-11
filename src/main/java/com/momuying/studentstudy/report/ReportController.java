package com.momuying.studentstudy.report;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
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
                  COALESCE(SUM(CASE WHEN i.mastery_score < 60 THEN 1 ELSE 0 END), 0) AS weak_count,
                  COALESCE(SUM(CASE WHEN i.mastery_score >= 90 THEN 1 ELSE 0 END), 0) AS mastered_count,
                  COALESCE(SUM(CASE WHEN i.total_review_count > 0 THEN 1 ELSE 0 END), 0) AS reviewed_items,
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

        List<Map<String, Object>> modules = jdbcTemplate.queryForList("""
                SELECT
                  s.name AS subject_name,
                  c.name AS category_name,
                  COUNT(*) AS item_count,
                  COALESCE(SUM(i.total_review_count), 0) AS review_count,
                  COALESCE(SUM(CASE WHEN i.mastery_score < 60 THEN 1 ELSE 0 END), 0) AS weak_count,
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

        return ApiResponse.ok(Map.of(
                "overview", overview,
                "dueToday", dueToday == null ? 0 : dueToday,
                "modules", modules
        ));
    }
}
