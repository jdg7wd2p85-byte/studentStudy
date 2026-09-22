package com.momuying.studentstudy.exam;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@TestExecutionListeners(listeners = DependencyInjectionTestExecutionListener.class,
        mergeMode = TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
class ExamControllerTest {
    @Autowired ExamController exams;
    @Autowired JdbcTemplate jdbc;

    @Test
    void tracksLatestAttemptAndFiltersAcrossYearsWithoutCountingUnlearnedAsWrong() {
        Long childId = jdbc.queryForObject("SELECT id FROM children LIMIT 1", Long.class);
        long paper2025 = (long) exams.createPaper(new ExamController.PaperInput(childId, 2025, "数学",
                "2025 上海中考数学", "https://example.com/2025.pdf", null, null)).data().get("id");
        long paper2024 = (long) exams.createPaper(new ExamController.PaperInput(childId, 2024, "数学",
                "2024 上海中考数学", null, null, null)).data().get("id");

        long learned = (long) exams.createQuestion(paper2025, childId, new ExamController.QuestionInput(
                "7", "填空", null, null, "因式分解", "七年级", "七下", "LEARNED", "基础", null)).data().get("id");
        exams.createQuestion(paper2024, childId, new ExamController.QuestionInput(
                "24", "解答", null, null, "二次函数", "九年级", "九上", "UNLEARNED", "综合", null));

        exams.addAttempt(learned, new ExamController.AttemptInput(childId, "WRONG", "概念混淆", "先补知识点"));
        exams.addAttempt(learned, new ExamController.AttemptInput(childId, "CORRECT", null, "独立做对"));

        var all = exams.allQuestions(childId, null, "数学", null, null, null, null).data();
        assertThat(all).hasSize(2);
        assertThat(all).filteredOn(row -> "UNLEARNED".equals(row.get("learning_stage")))
                .singleElement().satisfies(row -> assertThat(row.get("latest_result")).isNull());
        assertThat(exams.allQuestions(childId, null, null, "七年级", "LEARNED", "CORRECT", "因式").data())
                .singleElement().satisfies(row -> assertThat(row.get("attempt_count")).isEqualTo(2L));
        assertThat(exams.attempts(learned, childId).data()).hasSize(2);
    }
}
