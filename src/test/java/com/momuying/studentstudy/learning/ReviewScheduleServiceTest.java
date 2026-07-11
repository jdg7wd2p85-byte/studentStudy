package com.momuying.studentstudy.learning;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewScheduleServiceTest {
    private final ReviewScheduleService service = new ReviewScheduleService();

    @Test
    void skilledReviewRaisesScoreAndInterval() {
        LocalDateTime now = LocalDateTime.of(2026, 7, 11, 12, 0);

        ReviewScheduleService.ReviewResult result = service.schedule(50, 1, 3, now);

        assertThat(result.masteryScore()).isEqualTo(62);
        assertThat(result.reviewStage()).isEqualTo(3);
        assertThat(result.nextReviewAt()).isEqualTo(now.plusDays(7));
    }

    @Test
    void failedReviewDropsScoreAndSchedulesTomorrow() {
        LocalDateTime now = LocalDateTime.of(2026, 7, 11, 12, 0);

        ReviewScheduleService.ReviewResult result = service.schedule(50, 4, 0, now);

        assertThat(result.masteryScore()).isEqualTo(30);
        assertThat(result.reviewStage()).isEqualTo(2);
        assertThat(result.nextReviewAt()).isEqualTo(now.plusDays(1));
    }

    @Test
    void newItemIsReviewableImmediately() {
        LocalDateTime learnedAt = LocalDateTime.of(2026, 7, 11, 12, 0);

        assertThat(service.initialNextReview(learnedAt)).isEqualTo(learnedAt);
    }
}
