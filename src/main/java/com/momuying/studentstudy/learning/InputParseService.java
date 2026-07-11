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
    private static final Pattern OBSIDIAN_WORD = Pattern.compile("^#([^\\s#%]+)\\s+([A-Za-z][A-Za-z'\\-]*)\\s+%%(.+?)%%\\s*$");
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
        String displayMode = "WORD".equals(categoryCode) ? "FLASHCARD" : "QA";
        List<String> tags = parseTags(request.tags());
        Map<String, Object> extra = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();

        Matcher obsidian = OBSIDIAN_WORD.matcher(line);
        if (obsidian.matches()) {
            String tag = obsidian.group(1);
            String word = obsidian.group(2);
            String meaning = obsidian.group(3);
            tags.add(tag);
            extra.put("word", word);
            extra.put("meaning", meaning);
            return new ParsedItem(line, "WORD", "FLASHCARD", word, word, null, meaning, null,
                    distinct(tags), extra, 0.96, warnings);
        }

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

        warnings.add("未识别出明确答案，请确认后保存");
        return new ParsedItem(line, categoryCode, displayMode, line, line, line, "", null,
                distinct(tags), extra, 0.35, warnings);
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
