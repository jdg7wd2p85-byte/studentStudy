package com.momuying.studentstudy.learning;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.momuying.studentstudy.common.ApiResponse;
import com.momuying.studentstudy.learning.dto.CreateItemRequest;
import com.momuying.studentstudy.learning.dto.ParseRequest;
import com.momuying.studentstudy.learning.dto.ParsedItem;
import com.momuying.studentstudy.learning.dto.ReviewRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class LearningController {
    private final JdbcTemplate jdbcTemplate;
    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;
    private final InputParseService inputParseService;
    private final ReviewScheduleService scheduleService;

    public LearningController(
            JdbcTemplate jdbcTemplate,
            JdbcClient jdbcClient,
            ObjectMapper objectMapper,
            InputParseService inputParseService,
            ReviewScheduleService scheduleService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
        this.inputParseService = inputParseService;
        this.scheduleService = scheduleService;
    }

    @PostMapping("/items/parse")
    public ApiResponse<List<ParsedItem>> parse(@RequestBody ParseRequest request) {
        return ApiResponse.ok(inputParseService.parse(request));
    }

    @PostMapping("/items")
    public ApiResponse<Map<String, Object>> create(@RequestBody CreateItemRequest request) throws JsonProcessingException {
        LocalDateTime now = LocalDateTime.now();
        String itemType = valueOrDefault(request.itemType(), categoryCode(request.categoryId()));
        String displayMode = valueOrDefault(request.displayMode(), categoryDisplayMode(request.categoryId()));
        String title = required(request.title(), "标题不能为空");
        String answer = blankToNull(request.answer());
        Long existingId = findDuplicateId(request.childId(), request.categoryId(), title, answer);
        if (existingId != null) {
            return ApiResponse.ok(item(existingId));
        }
        String tags = request.tags() == null ? "" : String.join(",", request.tags());
        jdbcTemplate.update("""
                INSERT INTO learning_items(
                  child_id, subject_id, category_id, item_type, display_mode, title, prompt, content,
                  answer, explanation, extra_json, source, tags, first_learned_at, next_review_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                request.childId(), request.subjectId(), request.categoryId(), itemType, displayMode,
                title, request.prompt(), request.content(), answer,
                request.explanation(), toJson(request.extraFields()), request.source(), tags,
                Timestamp.valueOf(now), Timestamp.valueOf(scheduleService.initialNextReview(now)));
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return ApiResponse.ok(item(id));
    }

    @PostMapping("/items/batch")
    public ApiResponse<List<Map<String, Object>>> createBatch(@RequestBody List<CreateItemRequest> requests) throws JsonProcessingException {
        List<Map<String, Object>> created = new ArrayList<>();
        for (CreateItemRequest request : requests) {
            created.add(create(request).data());
        }
        return ApiResponse.ok(created);
    }

    @GetMapping("/items")
    public ApiResponse<List<Map<String, Object>>> items(
            @RequestParam(required = false) Long childId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String tag
    ) {
        StringBuilder sql = new StringBuilder("""
                SELECT i.*, c.name AS category_name, s.name AS subject_name
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                JOIN subjects s ON s.id = i.subject_id
                WHERE i.status <> 'ARCHIVED'
                """);
        List<Object> args = new ArrayList<>();
        if (childId != null) {
            sql.append(" AND i.child_id = ?");
            args.add(childId);
        }
        if (categoryId != null) {
            sql.append(" AND i.category_id = ?");
            args.add(categoryId);
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND (i.title LIKE ? OR i.answer LIKE ? OR i.content LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (tag != null && !tag.isBlank()) {
            sql.append(" AND i.tags LIKE ?");
            args.add("%" + tag.trim() + "%");
        }
        sql.append(" ORDER BY i.next_review_at ASC, i.mastery_score ASC, i.id DESC LIMIT 200");
        return ApiResponse.ok(jdbcTemplate.queryForList(sql.toString(), args.toArray()));
    }

    @GetMapping("/reviews/today")
    public ApiResponse<List<Map<String, Object>>> today(@RequestParam(required = false) Long childId) {
        String sql = """
                SELECT i.*, c.name AS category_name, s.name AS subject_name
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                JOIN subjects s ON s.id = i.subject_id
                WHERE i.status <> 'ARCHIVED'
                  AND i.next_review_at <= ?
                """ + (childId == null ? "" : " AND i.child_id = ?") + """
                ORDER BY i.next_review_at ASC, i.mastery_score ASC, i.wrong_count DESC, i.id ASC
                LIMIT 100
                """;
        Object[] args = childId == null
                ? new Object[]{Timestamp.valueOf(LocalDateTime.now().plusDays(1).toLocalDate().atStartOfDay())}
                : new Object[]{Timestamp.valueOf(LocalDateTime.now().plusDays(1).toLocalDate().atStartOfDay()), childId};
        return ApiResponse.ok(jdbcTemplate.queryForList(sql, args));
    }

    @PostMapping("/reviews/{itemId}/submit")
    public ApiResponse<Map<String, Object>> submitReview(@PathVariable Long itemId, @RequestBody ReviewRequest request) {
        Map<String, Object> before = item(itemId);
        int beforeScore = ((Number) before.get("mastery_score")).intValue();
        int beforeStage = ((Number) before.get("review_stage")).intValue();
        ReviewScheduleService.ReviewResult result = scheduleService.schedule(beforeScore, beforeStage, request.rating(), LocalDateTime.now());
        String status = result.masteryScore() >= 90 ? "MASTERED" : "ACTIVE";

        jdbcTemplate.update("""
                UPDATE learning_items
                SET mastery_score = ?, review_stage = ?, next_review_at = ?, last_review_at = ?,
                    total_review_count = total_review_count + 1,
                    correct_count = correct_count + ?,
                    wrong_count = wrong_count + ?,
                    status = ?
                WHERE id = ?
                """,
                result.masteryScore(), result.reviewStage(), Timestamp.valueOf(result.nextReviewAt()),
                Timestamp.valueOf(LocalDateTime.now()), request.rating() >= 2 ? 1 : 0, request.rating() < 2 ? 1 : 0,
                status, itemId);
        jdbcTemplate.update("""
                INSERT INTO review_records(child_id, item_id, reviewed_at, rating, before_mastery_score, after_mastery_score,
                  before_stage, after_stage, next_review_at, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                before.get("child_id"), itemId, Timestamp.valueOf(LocalDateTime.now()), request.rating(),
                beforeScore, result.masteryScore(), beforeStage, result.reviewStage(),
                Timestamp.valueOf(result.nextReviewAt()), request.note());
        return ApiResponse.ok(item(itemId));
    }

    private Map<String, Object> item(Long id) {
        return jdbcTemplate.queryForMap("""
                SELECT i.*, c.name AS category_name, s.name AS subject_name
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                JOIN subjects s ON s.id = i.subject_id
                WHERE i.id = ?
                """, id);
    }

    private Long findDuplicateId(Long childId, Long categoryId, String title, String answer) {
        List<Long> ids = jdbcTemplate.queryForList("""
                SELECT id
                FROM learning_items
                WHERE child_id = ?
                  AND category_id = ?
                  AND LOWER(title) = LOWER(?)
                  AND COALESCE(answer, '') = COALESCE(?, '')
                  AND status <> 'ARCHIVED'
                ORDER BY id ASC
                LIMIT 1
                """, Long.class, childId, categoryId, title, answer);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private String categoryCode(Long categoryId) {
        return jdbcClient.sql("SELECT code FROM item_categories WHERE id = ?")
                .param(categoryId).query(String.class).single();
    }

    private String categoryDisplayMode(Long categoryId) {
        return jdbcClient.sql("SELECT default_display_mode FROM item_categories WHERE id = ?")
                .param(categoryId).query(String.class).single();
    }

    private String toJson(Object value) throws JsonProcessingException {
        if (value == null) {
            return "{}";
        }
        return objectMapper.writeValueAsString(value);
    }

    private String required(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String valueOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
