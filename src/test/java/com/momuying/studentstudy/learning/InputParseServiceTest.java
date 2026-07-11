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
}
