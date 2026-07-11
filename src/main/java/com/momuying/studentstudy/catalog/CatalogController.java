package com.momuying.studentstudy.catalog;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class CatalogController {
    private final JdbcTemplate jdbcTemplate;

    public CatalogController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/api/catalog")
    public ApiResponse<Map<String, Object>> catalog() {
        List<Map<String, Object>> children = jdbcTemplate.queryForList("SELECT * FROM children ORDER BY id");
        List<Map<String, Object>> subjects = jdbcTemplate.queryForList("SELECT * FROM subjects ORDER BY sort_order, id");
        List<Map<String, Object>> categories = jdbcTemplate.queryForList("""
                SELECT c.*, s.name AS subject_name
                FROM item_categories c
                LEFT JOIN subjects s ON s.id = c.subject_id
                ORDER BY c.sort_order, c.id
                """);
        return ApiResponse.ok(Map.of(
                "children", children,
                "subjects", subjects,
                "categories", categories
        ));
    }
}
