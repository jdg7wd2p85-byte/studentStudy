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
    private static final Pattern ENGLISH_WITH_CHINESE_MEANING = Pattern.compile("^([A-Za-z][A-Za-z' -]*?[A-Za-z])\\s+([\\p{IsHan}].+)$");
    private static final Pattern DETAIL_SPLIT = Pattern.compile("\\s*(?:\\|\\||;;|；；)\\s*");

    public List<ParsedItem> parse(ParseRequest request) {
        if (request.rawText() == null || request.rawText().isBlank()) {
            return List.of();
        }
        if ("TEXT".equals(valueOrDefault(request.categoryCode(), "WORD"))) {
            return List.of(parseLine(request.rawText().trim(), request));
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
                mergeVocabularyDetails(extra, trailing);
            }
            return new ParsedItem(line, "WORD", "FLASHCARD", word, word, null, meaning, null,
                    distinct(tags), extra, 0.96, warnings);
        }

        if (isLanguageCard(categoryCode)) {
            Matcher kv = KEY_VALUE.matcher(line);
            if (kv.matches()) {
                String key = kv.group(1).trim();
                VocabularyValue parsed = parseVocabularyValue(kv.group(2).trim());
                extra.put("rawKey", key);
                extra.put("rawValue", parsed.answer());
                extra.putAll(parsed.extraFields());
                return new ParsedItem(line, categoryCode, displayMode, key, key, key, parsed.answer(), null,
                        distinct(tags), extra, 0.82, warnings);
            }

            Matcher word = ENGLISH_WITH_CHINESE_MEANING.matcher(line);
            if (word.matches()) {
                String title = word.group(1).trim();
                VocabularyValue parsed = parseVocabularyValue(word.group(2).trim());
                extra.put("word", title);
                extra.put("meaning", parsed.answer());
                extra.putAll(parsed.extraFields());
                String parsedType = "SENTENCE".equals(categoryCode) ? "SENTENCE" : "WORD";
                return new ParsedItem(line, parsedType, "FLASHCARD", title, title, null, parsed.answer(), null,
                        distinct(tags), extra, 0.9, warnings);
            }
        }

        String title = summarize(line);
        if ("TEXT".equals(categoryCode)) {
            return new ParsedItem(line, categoryCode, displayMode, title, title, line, "", null,
                    distinct(tags), extra, 0.8, warnings);
        }
        warnings.add("未识别出明确答案，请确认后保存");
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
        String value = line.lines()
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .findFirst()
                .orElse(line.trim());
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

    private VocabularyValue parseVocabularyValue(String value) {
        String[] parts = DETAIL_SPLIT.split(value);
        String answer = parts.length == 0 ? value.trim() : parts[0].trim();
        Map<String, Object> extra = new LinkedHashMap<>();
        for (int i = 1; i < parts.length; i++) {
            putVocabularyDetail(extra, parts[i]);
        }
        return new VocabularyValue(answer, extra);
    }

    private void mergeVocabularyDetails(Map<String, Object> extra, String value) {
        String[] parts = DETAIL_SPLIT.split(value);
        for (String part : parts) {
            putVocabularyDetail(extra, part);
        }
    }

    private void putVocabularyDetail(Map<String, Object> extra, String part) {
        if (part == null || part.isBlank()) {
            return;
        }
        Matcher matcher = KEY_VALUE.matcher(part.trim());
        if (!matcher.matches()) {
            return;
        }
        String key = normalizeDetailKey(matcher.group(1).trim());
        String value = matcher.group(2).trim();
        if (!key.isBlank() && !value.isBlank()) {
            extra.put(key, value);
        }
    }

    private String normalizeDetailKey(String label) {
        return switch (label.toLowerCase()) {
            case "例句", "造句", "句子", "example", "sentence", "example sentence" -> "exampleSentence";
            case "中文", "例句中文", "句子中文", "翻译", "translation", "sentence translation" -> "exampleTranslation";
            case "相似词", "近义词", "类似词", "similar", "similar words", "synonym", "synonyms" -> "similarWords";
            case "反义词", "反义", "antonym", "antonyms", "opposite" -> "antonyms";
            case "音标", "phonetic", "ipa" -> "phonetic";
            case "搭配", "常见搭配", "词组", "短语", "phrase", "phrases" -> "phrase";
            default -> label;
        };
    }

    private String valueOrDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private record VocabularyValue(String answer, Map<String, Object> extraFields) {
    }
}
