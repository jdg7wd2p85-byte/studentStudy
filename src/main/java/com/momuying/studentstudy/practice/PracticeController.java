package com.momuying.studentstudy.practice;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/practice")
public class PracticeController {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public PracticeController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/candidates")
    public ApiResponse<List<Map<String, Object>>> candidates(
            @RequestParam(required = false) Long childId,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false, defaultValue = "false") boolean weakOnly
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
        if (tag != null && !tag.isBlank()) {
            sql.append(" AND i.tags LIKE ?");
            args.add("%" + tag.trim() + "%");
        }
        if (weakOnly) {
            sql.append(" AND (i.mastery_score < 60 OR i.wrong_count > 0)");
        }
        sql.append(" ORDER BY i.mastery_score ASC, i.wrong_count DESC, i.id DESC LIMIT 100");
        return ApiResponse.ok(jdbcTemplate.queryForList(sql.toString(), args.toArray()));
    }

    @PostMapping("/papers")
    public ApiResponse<Map<String, Object>> createPaper(@RequestBody CreatePaperRequest request) throws JsonProcessingException {
        if (request.itemIds() == null || request.itemIds().isEmpty()) {
            throw new IllegalArgumentException("请选择至少一个学习项");
        }
        jdbcTemplate.update("""
                INSERT INTO practice_papers(child_id, title, source_type, filter_json, question_count, include_answer)
                VALUES (?, ?, ?, ?, ?, ?)
                """, request.childId(), request.title(), request.sourceType(), objectMapper.writeValueAsString(request),
                request.itemIds().size(), request.includeAnswer() ? 1 : 0);
        Long paperId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        int order = 1;
        for (Long itemId : request.itemIds()) {
            Map<String, Object> item = jdbcTemplate.queryForMap("SELECT * FROM learning_items WHERE id = ?", itemId);
            jdbcTemplate.update("""
                    INSERT INTO practice_paper_items(paper_id, item_id, question_type, question_text, answer_text,
                      explanation_text, sort_order, config_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, paperId, itemId, questionType((String) item.get("item_type")),
                    questionText(item), item.get("answer"), item.get("explanation"), order++, "{}");
        }
        return ApiResponse.ok(paper(paperId));
    }

    @GetMapping("/papers/{paperId}")
    public ApiResponse<Map<String, Object>> getPaper(@PathVariable Long paperId) {
        return ApiResponse.ok(paper(paperId));
    }

    @PostMapping("/choices")
    public ApiResponse<List<Map<String, Object>>> choices(@RequestBody ChoiceQuizRequest request) {
        if (request.itemIds() == null || request.itemIds().isEmpty()) {
            throw new IllegalArgumentException("请选择至少一个单词");
        }
        String placeholders = String.join(",", request.itemIds().stream().map(id -> "?").toList());
        List<Map<String, Object>> selected = jdbcTemplate.queryForList("""
                SELECT i.id, i.title, i.answer, i.content, c.code AS category_code
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                WHERE i.status <> 'ARCHIVED'
                  AND c.code = 'WORD'
                  AND i.answer IS NOT NULL
                  AND i.answer <> ''
                  AND i.id IN (
                """ + placeholders + """
                  )
                ORDER BY i.id DESC
                """, request.itemIds().toArray());
        if (selected.isEmpty()) {
            throw new IllegalArgumentException("请选择英文单词类型的学习项");
        }
        List<Map<String, Object>> pool = jdbcTemplate.queryForList("""
                SELECT i.id, i.title, i.answer
                FROM learning_items i
                JOIN item_categories c ON c.id = i.category_id
                WHERE i.status <> 'ARCHIVED'
                  AND c.code = 'WORD'
                  AND i.answer IS NOT NULL
                  AND i.answer <> ''
                ORDER BY i.id DESC
                LIMIT 300
                """);
        String direction = request.direction() == null ? "EN_TO_CN" : request.direction();
        List<Map<String, Object>> questions = selected.stream()
                .map(item -> choiceQuestion(item, pool, direction))
                .toList();
        return ApiResponse.ok(questions);
    }

    private Map<String, Object> paper(Long paperId) {
        Map<String, Object> paper = jdbcTemplate.queryForMap("SELECT * FROM practice_papers WHERE id = ?", paperId);
        List<Map<String, Object>> items = jdbcTemplate.queryForList(
                "SELECT * FROM practice_paper_items WHERE paper_id = ? ORDER BY sort_order", paperId);
        paper.put("items", items);
        return paper;
    }

    private String questionText(Map<String, Object> item) {
        String type = (String) item.get("item_type");
        if ("WORD".equals(type)) {
            return "请写出含义或拼写：" + item.get("title");
        }
        if ("FORMULA".equals(type)) {
            return "请写出公式：" + item.get("title");
        }
        return String.valueOf(item.get("title"));
    }

    private String questionType(String itemType) {
        if ("WORD".equals(itemType)) return "DICTATION";
        if ("FORMULA".equals(itemType)) return "FORMULA_BLANK";
        if ("WRONG_QUESTION".equals(itemType)) return "RETRY_WRONG";
        return "QA";
    }

    private Map<String, Object> choiceQuestion(Map<String, Object> item, List<Map<String, Object>> pool, String direction) {
        boolean chineseToEnglish = "CN_TO_EN".equals(direction);
        String prompt = chineseToEnglish ? answerOf(item) : String.valueOf(item.get("title"));
        String correct = chineseToEnglish ? String.valueOf(item.get("title")) : answerOf(item);
        Set<String> options = new LinkedHashSet<>();
        options.add(correct);
        List<String> distractors = new ArrayList<>(pool.stream()
                .filter(row -> !String.valueOf(row.get("id")).equals(String.valueOf(item.get("id"))))
                .map(row -> chineseToEnglish ? String.valueOf(row.get("title")) : answerOf(row))
                .filter(value -> value != null && !value.isBlank() && !value.equals(correct))
                .toList());
        Collections.shuffle(distractors);
        for (String distractor : distractors) {
            if (options.size() >= 4) break;
            options.add(distractor);
        }
        List<String> shuffled = new ArrayList<>(options);
        Collections.shuffle(shuffled);
        return Map.of(
                "itemId", item.get("id"),
                "prompt", prompt,
                "direction", direction,
                "options", shuffled,
                "correctOption", correct
        );
    }

    private String answerOf(Map<String, Object> item) {
        Object answer = item.get("answer");
        if (answer != null && !String.valueOf(answer).isBlank()) return String.valueOf(answer);
        Object content = item.get("content");
        return content == null ? "" : String.valueOf(content);
    }

    public record CreatePaperRequest(
            Long childId,
            String title,
            String sourceType,
            boolean includeAnswer,
            List<Long> itemIds
    ) {
    }

    public record ChoiceQuizRequest(
            List<Long> itemIds,
            String direction
    ) {
    }
}
