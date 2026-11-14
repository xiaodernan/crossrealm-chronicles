package com.crossrealm.chronicles.ai.lore;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Lore Oracle 的本地守门：索引必须在启动态就能回答「典籍里明明白白写了什么」的问题。
 * 任何人改 tokenizer / corpus build 之后跑这里，9/10 的坑都会在这里挂。
 */
class Bm25IndexTest {

    private final LoreCorpus corpus = new LoreCorpus();
    private final Bm25Index index = new Bm25Index(corpus);

    @Test
    void corpus_loads_and_is_non_trivial() {
        assertFalse(corpus.docs().isEmpty());
        assertTrue(corpus.docs().size() > 500, "corpus should hold the whole blp — got " + corpus.docs().size());
    }

    @Test
    void tokenizer_keeps_han_codepoints_and_ascii_runs() {
        List<String> tokens = Bm25Tokenizer.tokenize("锚火 anchor-fire 锚火2");
        assertTrue(tokens.contains("锚"));
        assertTrue(tokens.contains("火"));
        assertTrue(tokens.contains("anchor"));
        assertTrue(tokens.contains("fire"));
        assertTrue(tokens.contains("2"));
    }

    @Test
    void fireAnchor_query_matches_canon_chapters() {
        List<Bm25Index.Hit> hits = index.search("锚火", 5);
        assertFalse(hits.isEmpty());
        // 锚火是全书母题，前三条里至少一条落在前四章的主干章
        assertTrue(hits.stream().anyMatch(h -> h.doc().source().contains("novel/")));
    }

    @Test
    void linDu_query_matches_lin_du_chapter() {
        List<Bm25Index.Hit> hits = index.search("林渡", 5);
        assertFalse(hits.isEmpty());
        assertTrue(hits.stream().anyMatch(h -> h.doc().source().contains("01-第一章")));
    }

    @Test
    void 熄_singleToken_everyHitContainsIt() {
        List<Bm25Index.Hit> hits = index.search("熄", 6);
        assertFalse(hits.isEmpty());
        for (Bm25Index.Hit hit : hits) {
            assertTrue(hit.doc().text().contains("熄"),
                    "single-token 查询命中的块必须真的含该 token: " + hit.doc().source());
        }
    }

    @Test
    void seventhChapterQuery_citesChapterSevenSource() {
        List<Bm25Index.Hit> hits = index.search("第七章", 6);
        assertFalse(hits.isEmpty());
        assertTrue(hits.stream().anyMatch(h -> h.doc().source().contains("07-第七章")),
                "第七章 查询应cites到 07-第七章-余烬.md");
    }

    @Test
    void englishQuery_matches_en_interlude() {
        List<Bm25Index.Hit> hits = index.search("fire", 6);
        assertFalse(hits.isEmpty());
        assertTrue(hits.stream().anyMatch(h -> h.doc().source().contains(".en.md") || h.doc().source().contains("/en/")));
    }

    @Test
    void unknownQuery_returnsEmpty_ratherThanFabricating() {
        List<Bm25Index.Hit> hits = index.search("zxqwv_kajsfd_1234567890_noun", 5);
        assertTrue(hits.isEmpty());
    }

    @Test
    void limitIsRespected() {
        List<Bm25Index.Hit> hits = index.search("火", 3);
        assertTrue(hits.size() <= 3);
        assertNotNull(hits.get(0).doc().source());
    }

    @Test
    void scoresDecreaseDescending() {
        List<Bm25Index.Hit> hits = index.search("火", 6);
        for (int i = 1; i < hits.size(); i++) {
            assertTrue(hits.get(i - 1).score() >= hits.get(i).score(), "hits not sorted by score");
        }
    }

    @Test
    void unrelated_mixedQuery_fallsBack_toMatchingHalves() {
        List<Bm25Index.Hit> hits = index.search("锚火 zxqwv_kajsfd_1234567890", 5);
        assertFalse(hits.isEmpty(), "混合查询只要一半匹配也该有命中");
    }
}
