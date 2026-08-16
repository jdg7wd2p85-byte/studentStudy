package com.momuying.studentstudy.learning;

import com.momuying.studentstudy.learning.dto.ParsedItem;
import com.momuying.studentstudy.learning.dto.ParseRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class InputParseServiceTest {
    private final InputParseService service = new InputParseService();

    @Test
    void parsesObsidianWordFormat() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 1L, "WORD", "#英文单词 memory %%记忆%%", "", ""));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).title()).isEqualTo("memory");
        assertThat(items.get(0).answer()).isEqualTo("记忆");
        assertThat(items.get(0).tags()).contains("英文单词");
    }

    @Test
    void parsesObsidianWordFormatWithTrailingNumber() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 1L, "WORD", "#英文单词 Chamomile %%洋甘菊%% 1", "", ""));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).title()).isEqualTo("Chamomile");
        assertThat(items.get(0).answer()).isEqualTo("洋甘菊");
        assertThat(items.get(0).extraFields()).containsEntry("sourceIndex", 1);
    }

    @Test
    void parsesObsidianPhraseFormat() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 1L, "WORD", "#英文单词 work out %%锻炼；解决%%", "", ""));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).title()).isEqualTo("work out");
        assertThat(items.get(0).answer()).isEqualTo("锻炼；解决");
    }

    @Test
    void parsesColonFormat() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 1L, "WORD", "efficient: 高效的", "", "易错"));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).title()).isEqualTo("efficient");
        assertThat(items.get(0).answer()).isEqualTo("高效的");
        assertThat(items.get(0).tags()).contains("易错");
    }

    @Test
    void parsesVocabularyDetails() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 1L, "WORD",
                "#英文单词 memory %%记忆%% || 例句: I have a good memory. || 中文: 我记性很好。 || 相似词: recollection || 反义词: forgetfulness",
                "", ""));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).answer()).isEqualTo("记忆");
        assertThat(items.get(0).extraFields())
                .containsEntry("exampleSentence", "I have a good memory.")
                .containsEntry("exampleTranslation", "我记性很好。")
                .containsEntry("similarWords", "recollection")
                .containsEntry("antonyms", "forgetfulness");
    }

    @Test
    void parsesPhraseWithExampleTranslation() {
        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 1L, 2L, "SENTENCE",
                "look after: 照顾 || 造句: I look after my sister. || 中文: 我照顾妹妹。",
                "", ""));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).title()).isEqualTo("look after");
        assertThat(items.get(0).categoryCode()).isEqualTo("SENTENCE");
        assertThat(items.get(0).answer()).isEqualTo("照顾");
        assertThat(items.get(0).extraFields())
                .containsEntry("exampleSentence", "I look after my sister.")
                .containsEntry("exampleTranslation", "我照顾妹妹。");
    }

    @Test
    void keepsChineseTextCompleteInsteadOfSplittingByPunctuation() {
        String text = "床前明月光：疑是地上霜。举头望明月，低头思故乡。";

        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 2L, 3L, "TEXT", text, "", "语文"));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).displayMode()).isEqualTo("LONG_TEXT");
        assertThat(items.get(0).content()).isEqualTo(text);
        assertThat(items.get(0).answer()).isEmpty();
        assertThat(items.get(0).warnings()).isEmpty();
    }

    @Test
    void keepsMultiLineChineseTextAsOneItem() {
        String text = """
                春
                朱自清
                盼望着，盼望着，东风来了，春天的脚步近了。
                一切都像刚睡醒的样子，欣欣然张开了眼。
                """.trim();

        List<ParsedItem> items = service.parse(new ParseRequest(
                1L, 2L, 3L, "TEXT", text, "", "语文"));

        assertThat(items).hasSize(1);
        assertThat(items.get(0).content()).isEqualTo(text);
        assertThat(items.get(0).title()).isEqualTo("春");
        assertThat(items.get(0).displayMode()).isEqualTo("LONG_TEXT");
    }
}
