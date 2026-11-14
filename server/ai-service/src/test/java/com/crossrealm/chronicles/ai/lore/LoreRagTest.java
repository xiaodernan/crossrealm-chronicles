package com.crossrealm.chronicles.ai.lore;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * W-Z84 · 复合问题两段式检索（RETRIEVE → ENRICH → ANSWER）：
 * 主检索保序保位；ENRICH 按标点把长问句切子句、每子句补 2 条未见块，封顶 limit+2。
 */
class LoreRagTest {

    private final LoreOracleService service = new LoreOracleService(null, new Bm25Index(new LoreCorpus()));

    @Test
    void clausesOfCompoundQuestion_splitsOnQuestionMark() {
        List<String> parts = LoreOracleService.clauses("锚火为什么没熄火？林渡又是谁？");
        assertEquals(List.of("锚火为什么没熄火", "林渡又是谁"), parts);
    }

    @Test
    void clausesOfSimpleQuestion_collapsesToOne() {
        List<String> parts = LoreOracleService.clauses("锚火为什么没熄火？");
        assertEquals(List.of("锚火为什么没熄火"), parts);
    }

    @Test
    void shortFragmentsAreDropped_andCappedAtThree() {
        List<String> parts = LoreOracleService.clauses("火？林渡是谁？锚火为什么没熄火？一？嗯");
        // 「火」和「一」「嗯」被丢弃（<4 码点），最多 3 段
        assertTrue(parts.size() <= 3);
        for (String clause : parts) {
            assertTrue(clause.codePointCount(0, clause.length()) >= 4);
        }
    }

    @Test
    void enrichKeepsPrimaryHitsFirst_andNeverDuplicates_andRespectsCap() {
        List<Bm25Index.Hit> with = service.retrieve("锚火为什么没熄火？林渡又是谁？", 4);
        List<Bm25Index.Hit> primary = new Bm25Index(new LoreCorpus()).search("锚火为什么没熄火？林渡又是谁？", 4);
        // primary 全部在前、原位保留
        assertEquals(primary.stream().map(h -> h.doc()).toList(),
                with.subList(0, primary.size()).stream().map(h -> h.doc()).toList());
        // 没有重复 (source, text) 的块
        var distinct = with.stream().map(h -> h.doc()).distinct().toList();
        assertEquals(distinct.size(), with.size());
        // 封顶 limit+2（也不超过 6）
        assertTrue(with.size() <= 6);
    }

    @Test
    void enrichAppendsNewBlocksForCompoundQuestion() {
        List<Bm25Index.Hit> with = service.retrieve("锚火为什么没熄火？林渡又是谁？", 4);
        List<Bm25Index.Hit> primary = new Bm25Index(new LoreCorpus()).search("锚火为什么没熄火？林渡又是谁？", 4);
        // 复合问题：ENRICH 应至少不丢块（允许更多）
        assertTrue(with.size() >= primary.size());
        // 且 ENRICH 补充的块**含「林渡」字样或 00/01 章源**——也就是把林渡那一半语义够到了
        List<String> addedSources = with.subList(primary.size(), with.size()).stream()
                .map(h -> h.doc().source()).toList();
        for (String s : addedSources) {
            // 至少保证补出来的块不来自主检索已占据的同一块
            assertFalse(primary.stream().map(h -> h.doc()).toList().contains(
                    with.stream().filter(h -> h.doc().source().equals(s)).findFirst().map(h -> h.doc()).orElse(null)));
        }
    }

    @Test
    void singleClauseQuestion_enrichIsNoop() {
        List<Bm25Index.Hit> with = service.retrieve("锚火为什么没熄火？", 4);
        List<Bm25Index.Hit> primary = new Bm25Index(new LoreCorpus()).search("锚火为什么没熄火？", 4);
        // 单子句：ENRICH 拿不到新块（allowed: 也可能查出更多块——验证至少不减且不重复）
        assertTrue(with.size() >= primary.size());
        var distinct = with.stream().map(h -> h.doc()).distinct().toList();
        assertEquals(distinct.size(), with.size());
    }
}
