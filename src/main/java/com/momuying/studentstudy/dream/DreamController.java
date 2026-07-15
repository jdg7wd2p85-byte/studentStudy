package com.momuying.studentstudy.dream;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Date;
import java.util.Map;

@RestController
@RequestMapping("/api/dreams")
public class DreamController {
    private final JdbcTemplate jdbcTemplate;

    public DreamController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public ApiResponse<Object> list(@RequestParam(required = false) Long childId) {
        if (childId == null) {
            return ApiResponse.ok(jdbcTemplate.queryForList("""
                    SELECT d.*, c.name AS child_name
                    FROM dream_entries d
                    JOIN children c ON c.id = d.child_id
                    WHERE d.status <> 'ARCHIVED'
                    ORDER BY d.created_at DESC, d.id DESC
                    LIMIT 100
                    """));
        }
        return ApiResponse.ok(jdbcTemplate.queryForList("""
                SELECT d.*, c.name AS child_name
                FROM dream_entries d
                JOIN children c ON c.id = d.child_id
                WHERE d.status <> 'ARCHIVED'
                  AND d.child_id = ?
                ORDER BY d.created_at DESC, d.id DESC
                LIMIT 100
                """, childId));
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> create(@RequestBody DreamRequest request) {
        String content = request.content() == null ? "" : request.content().trim();
        if (content.isBlank()) {
            throw new IllegalArgumentException("梦想内容不能为空");
        }
        Long childId = request.childId() == null ? firstChildId() : request.childId();
        jdbcTemplate.update("""
                INSERT INTO dream_entries(child_id, content, target_score, target_date)
                VALUES (?, ?, ?, ?)
                """, childId, content, request.targetScore(),
                request.targetDate() == null ? null : Date.valueOf(request.targetDate()));
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return ApiResponse.ok(find(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Map<String, Object>> archive(@PathVariable Long id) {
        int updated = jdbcTemplate.update("""
                UPDATE dream_entries
                SET status = 'ARCHIVED'
                WHERE id = ?
                  AND status <> 'ARCHIVED'
                """, id);
        return ApiResponse.ok(Map.of("deleted", updated));
    }

    private Map<String, Object> find(Long id) {
        return jdbcTemplate.queryForMap("""
                SELECT d.*, c.name AS child_name
                FROM dream_entries d
                JOIN children c ON c.id = d.child_id
                WHERE d.id = ?
                """, id);
    }

    private Long firstChildId() {
        return jdbcTemplate.queryForObject("SELECT id FROM children ORDER BY id LIMIT 1", Long.class);
    }
}
