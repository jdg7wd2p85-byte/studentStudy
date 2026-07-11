package com.momuying.studentstudy.learning;

import com.momuying.studentstudy.learning.dto.ParsedItem;
import com.momuying.studentstudy.learning.dto.ParseRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class InputParseService {
    private static final Pattern OBSIDIAN_WORD = Pattern.compile("^#([^\\s#%]+)\\s+(.+?)\\s+%%(.+?)%%\\s*(.*)$");
    private static final Pattern KEY_VALUE = Pattern.compile("^(.+?)\\s*(?:[:：=|])\\s*(.+)$");
    private static final Pattern WORD_SPACE_MEANING = Pattern.compile("^([A-Za-z][A-Za-z'\\-]*)\\s+(.+)$");

    public List<ParsedItem> parse(ParseRequest request) {
        if (request.rawText() == null || request.rawText().isBlank()) {
            return List.of();
        }
        List<ParsedItem> items = new ArrayList<>();
        for (String line : request.rawText().split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            items.add(parseLine(trimmed, request));
        }
        return items;
    }

    private ParsedItem parseLine(String line, ParseRequest request) {
        String categoryCode = valueOrDefault(request.categoryCode(), "WORD");
        String displayMode = displayModeFor(categoryCode);
        List<String> tags = parseTags(request.tags());
        Map<String, Object> extra = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();

        Matcher obsidian = OBSIDIAN_WORD.matcher(line);
        if (obsidian.matches()) {
            String tag = obsidian.group(1);
            String word = obsidian.group(2).trim();
            String meaning = obsidian.group(3);
            String trailing = obsidian.group(4).trim();
            tags.add(tag);
            extra.put("word", word);
            extra.put("meaning", meaning);
            if (!trailing.isBlank()) {
                extra.put("trailing", trailing);
                if (trailing.matches("\\d+")) {
                    extra.put("sourceIndex", Integer.parseInt(trailing));
                }
            }
            return new ParsedItem(line, "WORD", "FLASHCARD", word, word, null, meaning, null,
                    distinct(tags), extra, 0.96, warnings);
        }

        if (isLanguageCard(categoryCode)) {
            Matcher kv = KEY_VALUE.matcher(line);
            if (kv.matches()) {
                String key = kv.group(1).trim();
                String value = kv.group(2).trim();
                extra.put("rawKey", key);
                extra.put("rawValue", value);
                return new ParsedItem(line, categoryCode, displayMode, key, key, key, value, null,
                        distinct(tags), extra, 0.82, warnings);
            }

            Matcher word = WORD_SPACE_MEANING.matcher(line);
            if (word.matches()) {
                String title = word.group(1);
                String answer = word.group(2).trim();
                extra.put("word", title);
                extra.put("meaning", answer);
                return new ParsedItem(line, "WORD", "FLASHCARD", title, title, null, answer, null,
                        distinct(tags), extra, 0.9, warnings);
            }
        }

        warnings.add("未识别出明确答案，请确认后保存");
        String title = summarize(line);
        return new ParsedItem(line, categoryCode, displayMode, title, title, line, "", null,
                distinct(tags), extra, 0.35, warnings);
    }

    private boolean isLanguageCard(String categoryCode) {
        return "WORD".equals(categoryCode) || "SENTENCE".equals(categoryCode);
    }

    private String displayModeFor(String categoryCode) {
        return switch (categoryCode) {
            case "WORD", "SENTENCE" -> "FLASHCARD";
            case "TEXT" -> "LONG_TEXT";
            case "FORMULA" -> "FORMULA";
            case "WRONG_QUESTION" -> "EXPLANATION";
            default -> "QA";
        };
    }

    private String summarize(String line) {
        String value = line.trim();
        if (value.length() <= 60) {
            return value;
        }
        return value.substring(0, 60) + "...";
    }

    private List<String> parseTags(String tags) {
        List<String> values = new ArrayList<>();
        if (tags == null || tags.isBlank()) {
            return values;
        }
        for (String tag : tags.split("[,，\\s]+")) {
            if (!tag.isBlank()) {
                values.add(tag.trim());
            }
        }
        return values;
    }

    private List<String> distinct(List<String> tags) {
        return tags.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
    }

    private String valueOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
