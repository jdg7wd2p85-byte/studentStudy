package com.momuying.studentstudy.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbcTemplate;

    public DataInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        insertSubject("英语", 1);
        insertSubject("语文", 2);
        insertSubject("数学", 3);
        insertSubject("物理", 4);
        insertSubject("化学", 5);
        insertSubject("生物", 6);
        insertSubject("地理", 7);

        if (count("children") == 0) {
            jdbcTemplate.update("INSERT INTO children(name, grade) VALUES (?, ?)", "孩子", "");
        }

        insertCategory("WORD", "单词", "英语", "FLASHCARD", 1);
        insertCategory("SENTENCE", "句子/短语", "英语", "FLASHCARD", 2);
        insertCategory("EN_GRAMMAR", "语法", "英语", "QA", 3);
        insertCategory("EN_WRITING", "作文", "英语", "LONG_TEXT", 4);
        insertCategory("TEXT", "课文/古诗", "语文", "LONG_TEXT", 5);
        insertCategory("CN_RECITE", "背诵", "语文", "LONG_TEXT", 6);
        insertCategory("CN_WORD", "生词", "语文", "FLASHCARD", 7);
        insertCategory("THEOREM", "数学定理", "数学", "QA", 8);
        insertCategory("MATH_FORMULA", "公式", "数学", "FORMULA", 9);
        insertCategory("KNOWLEDGE", "知识点", "数学", "QA", 10);
        insertCategory("WRONG_QUESTION", "错题", "数学", "EXPLANATION", 11);
        insertCategory("FORMULA", "物理公式", "物理", "FORMULA", 12);
        insertCategory("PHYSICS_EXPERIMENT", "实验", "物理", "EXPLANATION", 13);
        insertCategory("CHEM_EQUATION", "方程式", "化学", "FORMULA", 14);
        insertCategory("CHEM_EXPERIMENT", "实验", "化学", "EXPLANATION", 15);
        insertCategory("CHEM_CONCEPT", "概念", "化学", "QA", 16);
        insertCategory("BIO_CONCEPT", "概念", "生物", "QA", 17);
        insertCategory("BIO_DIAGRAM", "图示", "生物", "EXPLANATION", 18);
        insertCategory("BIO_RECITE", "背诵", "生物", "LONG_TEXT", 19);
        insertCategory("GEO_MAP", "地图", "地理", "EXPLANATION", 20);
        insertCategory("GEO_CONCEPT", "概念", "地理", "QA", 21);
        insertCategory("GEO_RECITE", "背诵", "地理", "LONG_TEXT", 22);
    }

    private void insertSubject(String name, int sortOrder) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM subjects WHERE name = ?", Integer.class, name);
        if (exists != null && exists == 0) {
            jdbcTemplate.update("INSERT INTO subjects(name, sort_order) VALUES (?, ?)", name, sortOrder);
        }
    }

    private void insertCategory(String code, String name, String subjectName, String displayMode, int sortOrder) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM item_categories WHERE code = ?", Integer.class, code);
        if (exists != null && exists > 0) {
            return;
        }
        Long subjectId = jdbcTemplate.queryForObject(
                "SELECT id FROM subjects WHERE name = ?", Long.class, subjectName);
        jdbcTemplate.update("""
                INSERT INTO item_categories(code, name, subject_id, default_display_mode, field_schema_json, sort_order, is_system)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """, code, name, subjectId, displayMode, defaultSchema(code), sortOrder);
    }

    private long count(String table) {
        Long count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return count == null ? 0 : count;
    }

    private String defaultSchema(String code) {
        return switch (code) {
            case "WORD" -> """
                    {"fields":[
                      {"key":"phonetic","label":"音标","type":"text","required":false},
                      {"key":"sentence","label":"例句","type":"textarea","required":false},
                      {"key":"phrase","label":"常见搭配","type":"textarea","required":false}
                    ]}
                    """;
            case "FORMULA" -> """
                    {"fields":[
                      {"key":"variables","label":"变量含义","type":"textarea","required":false},
                      {"key":"condition","label":"适用条件","type":"textarea","required":false}
                    ]}
                    """;
            default -> "{\"fields\":[]}";
        };
    }
}
