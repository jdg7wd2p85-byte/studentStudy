package com.momuying.studentstudy.exam;

import com.momuying.studentstudy.common.ApiResponse;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/exams")
public class ExamController {
    private final JdbcTemplate jdbc;

    public ExamController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record PaperInput(Long childId, Integer year, String subject, String title,
                             String paperUrl, String answerUrl, String note) {}

    public record QuestionInput(String number, String type, String text, String questionUrl,
                                String knowledgePoints, String gradeLevel, String semester,
                                String learningStage, String difficulty, String note) {}

    public record AttemptInput(Long childId, String result, String errorReason, String note) {}

    @GetMapping("/papers")
    public ApiResponse<List<Map<String, Object>>> papers(@RequestParam Long childId) {
        return ApiResponse.ok(jdbc.queryForList("""
                SELECT p.*, COUNT(q.id) AS question_count
                FROM exam_papers p LEFT JOIN exam_questions q ON q.paper_id = p.id
                WHERE p.child_id = ?
                GROUP BY p.id ORDER BY p.exam_year DESC, p.subject, p.id DESC
                """, childId));
    }

    @PostMapping("/papers")
    public ApiResponse<Map<String, Object>> createPaper(@RequestBody PaperInput input) {
        validatePaper(input);
        try {
            long id = insert("""
                    INSERT INTO exam_papers(child_id, exam_year, subject, title, paper_url, answer_url, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, input.childId(), input.year(), trim(input.subject()), trim(input.title()),
                    url(input.paperUrl()), url(input.answerUrl()), blank(input.note()));
            return ApiResponse.ok(Map.of("id", id));
        } catch (DuplicateKeyException ex) {
            throw new IllegalArgumentException("该孩子的这一年、这一科真题已存在，请打开原卷编辑");
        }
    }

    @PutMapping("/papers/{id}")
    public ApiResponse<Map<String, Object>> updatePaper(@PathVariable Long id, @RequestBody PaperInput input) {
        validatePaper(input);
        int count;
        try {
            count = jdbc.update("""
                    UPDATE exam_papers SET exam_year=?, subject=?, title=?, paper_url=?, answer_url=?, note=?
                    WHERE id=? AND child_id=?
                    """, input.year(), trim(input.subject()), trim(input.title()), url(input.paperUrl()),
                    url(input.answerUrl()), blank(input.note()), id, input.childId());
        } catch (DuplicateKeyException ex) {
            throw new IllegalArgumentException("该孩子的这一年、这一科真题已存在");
        }
        if (count == 0) throw new IllegalArgumentException("原卷不存在");
        return ApiResponse.ok(Map.of("id", id));
    }

    @DeleteMapping("/papers/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> deletePaper(@PathVariable Long id, @RequestParam Long childId) {
        requirePaper(id, childId);
        jdbc.update("DELETE FROM exam_attempts WHERE question_id IN (SELECT id FROM exam_questions WHERE paper_id=?)", id);
        jdbc.update("DELETE FROM exam_questions WHERE paper_id=?", id);
        jdbc.update("DELETE FROM exam_papers WHERE id=? AND child_id=?", id, childId);
        return ApiResponse.ok(Map.of("id", id));
    }

    @GetMapping("/questions")
    public ApiResponse<List<Map<String, Object>>> allQuestions(@RequestParam Long childId,
                                                                  @RequestParam(required = false) Integer year,
                                                                  @RequestParam(required = false) String subject,
                                                                  @RequestParam(required = false) String grade,
                                                                  @RequestParam(required = false) String stage,
                                                                  @RequestParam(required = false) String result,
                                                                  @RequestParam(required = false) String keyword) {
        return queryQuestions(null, childId, year, subject, grade, stage, result, keyword);
    }

    @GetMapping("/papers/{id}/questions")
    public ApiResponse<List<Map<String, Object>>> questions(@PathVariable Long id,
                                                               @RequestParam Long childId,
                                                               @RequestParam(required = false) String grade,
                                                               @RequestParam(required = false) String stage,
                                                               @RequestParam(required = false) String result,
                                                               @RequestParam(required = false) String keyword) {
        requirePaper(id, childId);
        return queryQuestions(id, childId, null, null, grade, stage, result, keyword);
    }

    private ApiResponse<List<Map<String, Object>>> queryQuestions(Long paperId, Long childId,
                                                                    Integer year, String subject, String grade,
                                                                    String stage, String result, String keyword) {
        StringBuilder sql = new StringBuilder("""
                SELECT q.*, p.exam_year, p.subject, p.title AS paper_title,
                       a.result AS latest_result, a.error_reason AS latest_error_reason,
                       a.attempted_at AS latest_attempted_at,
                       (SELECT COUNT(*) FROM exam_attempts n WHERE n.question_id=q.id AND n.child_id=?) AS attempt_count
                FROM exam_questions q
                JOIN exam_papers p ON p.id=q.paper_id
                LEFT JOIN exam_attempts a ON a.id = (
                  SELECT MAX(x.id) FROM exam_attempts x WHERE x.question_id=q.id AND x.child_id=?
                )
                WHERE p.child_id=?
                """);
        List<Object> args = new ArrayList<>(List.of(childId, childId, childId));
        if (paperId != null) { sql.append(" AND q.paper_id=?"); args.add(paperId); }
        if (year != null) { sql.append(" AND p.exam_year=?"); args.add(year); }
        if (filled(subject)) { sql.append(" AND p.subject=?"); args.add(subject); }
        if (filled(grade)) { sql.append(" AND q.grade_level=?"); args.add(grade); }
        if (filled(stage)) { sql.append(" AND q.learning_stage=?"); args.add(stage); }
        if (filled(result)) {
            if ("UNATTEMPTED".equals(result)) sql.append(" AND a.id IS NULL");
            else { sql.append(" AND a.result=?"); args.add(result); }
        }
        if (filled(keyword)) {
            sql.append(" AND (q.knowledge_points LIKE ? OR q.question_no LIKE ? OR q.question_text LIKE ?)");
            String pattern = "%" + keyword.trim() + "%";
            args.add(pattern); args.add(pattern); args.add(pattern);
        }
        sql.append(" ORDER BY p.exam_year DESC, p.subject, LENGTH(q.question_no), q.question_no, q.id");
        return ApiResponse.ok(jdbc.queryForList(sql.toString(), args.toArray()));
    }

    @PostMapping("/papers/{id}/questions")
    public ApiResponse<Map<String, Object>> createQuestion(@PathVariable Long id,
                                                              @RequestParam Long childId,
                                                              @RequestBody QuestionInput input) {
        requirePaper(id, childId);
        validateQuestion(input);
        try {
            long questionId = insert("""
                    INSERT INTO exam_questions(paper_id, question_no, question_type, question_text,
                      question_url, knowledge_points, grade_level, semester, learning_stage, difficulty, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, trim(input.number()), blank(input.type()), blank(input.text()),
                    url(input.questionUrl()), blank(input.knowledgePoints()), blank(input.gradeLevel()),
                    blank(input.semester()), stage(input.learningStage()), blank(input.difficulty()), blank(input.note()));
            return ApiResponse.ok(Map.of("id", questionId));
        } catch (DuplicateKeyException ex) {
            throw new IllegalArgumentException("这张原卷的该题号已经存在");
        }
    }

    @PutMapping("/questions/{id}")
    public ApiResponse<Map<String, Object>> updateQuestion(@PathVariable Long id,
                                                              @RequestParam Long childId,
                                                              @RequestBody QuestionInput input) {
        requireQuestion(id, childId);
        validateQuestion(input);
        try {
            jdbc.update("""
                    UPDATE exam_questions SET question_no=?, question_type=?, question_text=?, question_url=?,
                      knowledge_points=?, grade_level=?, semester=?, learning_stage=?, difficulty=?, note=?
                    WHERE id=?
                    """, trim(input.number()), blank(input.type()), blank(input.text()), url(input.questionUrl()),
                    blank(input.knowledgePoints()), blank(input.gradeLevel()), blank(input.semester()),
                    stage(input.learningStage()), blank(input.difficulty()), blank(input.note()), id);
        } catch (DuplicateKeyException ex) {
            throw new IllegalArgumentException("这张原卷的该题号已经存在");
        }
        return ApiResponse.ok(Map.of("id", id));
    }

    @DeleteMapping("/questions/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> deleteQuestion(@PathVariable Long id, @RequestParam Long childId) {
        requireQuestion(id, childId);
        jdbc.update("DELETE FROM exam_attempts WHERE question_id=?", id);
        jdbc.update("DELETE FROM exam_questions WHERE id=?", id);
        return ApiResponse.ok(Map.of("id", id));
    }

    @PostMapping("/questions/{id}/attempts")
    public ApiResponse<Map<String, Object>> addAttempt(@PathVariable Long id, @RequestBody AttemptInput input) {
        if (input.childId() == null) throw new IllegalArgumentException("请选择孩子");
        requireQuestion(id, input.childId());
        if (input.result() == null || !List.of("CORRECT", "HINTED", "WRONG", "CARELESS").contains(input.result())) {
            throw new IllegalArgumentException("请选择有效的作答结果");
        }
        long attemptId = insert("""
                INSERT INTO exam_attempts(question_id, child_id, result, error_reason, note, attempted_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, input.childId(), input.result(), blank(input.errorReason()), blank(input.note()),
                LocalDateTime.now());
        return ApiResponse.ok(Map.of("id", attemptId));
    }

    @GetMapping("/questions/{id}/attempts")
    public ApiResponse<List<Map<String, Object>>> attempts(@PathVariable Long id, @RequestParam Long childId) {
        requireQuestion(id, childId);
        return ApiResponse.ok(jdbc.queryForList("""
                SELECT id, result, error_reason, note, attempted_at FROM exam_attempts
                WHERE question_id=? AND child_id=? ORDER BY attempted_at DESC, id DESC
                """, id, childId));
    }

    private void validatePaper(PaperInput input) {
        if (input.childId() == null || input.year() == null || input.year() < 2000 || input.year() > 2100
                || !filled(input.subject()) || !filled(input.title())) {
            throw new IllegalArgumentException("请填写孩子、年份、科目和原卷标题");
        }
    }

    private void validateQuestion(QuestionInput input) {
        if (!filled(input.number()) || input.number().length() > 32) {
            throw new IllegalArgumentException("请填写题号（最多32字）");
        }
        stage(input.learningStage());
    }

    private String stage(String value) {
        String result = filled(value) ? value : "UNKNOWN";
        if (!List.of("UNKNOWN", "LEARNED", "LEARNING", "UNLEARNED").contains(result)) {
            throw new IllegalArgumentException("无效的学习阶段");
        }
        return result;
    }

    private void requirePaper(Long id, Long childId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM exam_papers WHERE id=? AND child_id=?",
                Integer.class, id, childId);
        if (count == null || count == 0) throw new IllegalArgumentException("原卷不存在");
    }

    private void requireQuestion(Long id, Long childId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM exam_questions q JOIN exam_papers p ON p.id=q.paper_id
                WHERE q.id=? AND p.child_id=?
                """, Integer.class, id, childId);
        if (count == null || count == 0) throw new IllegalArgumentException("题目不存在");
    }

    private long insert(String sql, Object... args) {
        KeyHolder holder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, new String[]{"id"});
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            return ps;
        }, holder);
        return holder.getKey().longValue();
    }

    private String url(String value) {
        if (!filled(value)) return null;
        String candidate = value.trim();
        try {
            URI parsed = URI.create(candidate);
            if (candidate.length() <= 2048 && parsed.getScheme() != null
                    && List.of("http", "https").contains(parsed.getScheme().toLowerCase())
                    && parsed.getHost() != null) return candidate;
        } catch (IllegalArgumentException ignored) { }
        throw new IllegalArgumentException("链接必须是完整的 http 或 https 地址");
    }

    private static boolean filled(String value) { return value != null && !value.isBlank(); }
    private static String trim(String value) { return value.trim(); }
    private static String blank(String value) { return filled(value) ? value.trim() : null; }
}
