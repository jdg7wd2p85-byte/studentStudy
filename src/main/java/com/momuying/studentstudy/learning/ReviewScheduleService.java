package com.momuying.studentstudy.learning;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class ReviewScheduleService {
    private static final int[] LIGHT_INTERVAL_DAYS = {1, 2, 4, 7, 15, 30, 60};

    public ReviewResult schedule(int beforeScore, int beforeStage, int rating, LocalDateTime now) {
        if (rating < 0 || rating > 3) {
            throw new IllegalArgumentException("评分必须是 0-3");
        }

        int scoreDelta = switch (rating) {
            case 0 -> -20;
            case 1 -> -8;
            case 2 -> 8;
            case 3 -> 12;
            default -> 0;
        };
        int afterScore = Math.max(0, Math.min(100, beforeScore + scoreDelta));
        int afterStage = switch (rating) {
            case 0 -> Math.max(0, beforeStage - 2);
            case 1 -> beforeStage;
            case 2 -> Math.min(LIGHT_INTERVAL_DAYS.length - 1, beforeStage + 1);
            case 3 -> Math.min(LIGHT_INTERVAL_DAYS.length - 1, beforeStage + 2);
            default -> beforeStage;
        };
        int days = switch (rating) {
            case 0 -> 1;
            case 1 -> Math.max(1, LIGHT_INTERVAL_DAYS[Math.max(0, Math.min(beforeStage, LIGHT_INTERVAL_DAYS.length - 1))]);
            default -> LIGHT_INTERVAL_DAYS[afterStage];
        };
        return new ReviewResult(afterScore, afterStage, now.plusDays(days));
    }

    public LocalDateTime initialNextReview(LocalDateTime learnedAt) {
        return learnedAt;
    }

    public record ReviewResult(int masteryScore, int reviewStage, LocalDateTime nextReviewAt) {
    }
}
