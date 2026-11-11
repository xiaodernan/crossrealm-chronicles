package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TelemetryServiceTest {

    private TelemetryService service(int maxEvents) {
        GameServiceProperties properties = new GameServiceProperties();
        properties.getTelemetry().setMaxEvents(maxEvents);
        return new TelemetryService(properties);
    }

    @Test
    void recordsAndCountsEvents() {
        TelemetryService service = service(10);
        service.record("boss_defeated", "void-chronarch");
        service.record("dungeon_cleared", "abyss-deep-maw");
        assertEquals(2, service.count());
    }

    @Test
    void dropsOldestWhenFull() {
        TelemetryService service = service(3);
        service.record("a", "1");
        service.record("b", "2");
        service.record("c", "3");
        service.record("d", "4");

        assertEquals(3, service.count());
        var snapshot = service.snapshot();
        assertEquals("b", snapshot.get(0).type(), "满额时应丢弃最老的事件");
        assertEquals("d", snapshot.get(2).type());
    }

    @Test
    @DisplayName("空窗口：byType 空数组、窗口 0，不抛异常")
    void summaryOfEmptyWindow() {
        TelemetryService service = service(10);
        Map<String, Object> summary = service.summarize(5);
        assertEquals(0, summary.get("windowSize"));
        assertEquals(0, summary.get("distinctTypes"));
        assertEquals(0, summary.get("topN"));
        assertEquals(List.of(), summary.get("byType"));
    }

    @Test
    @DisplayName("频次统计 + 最高频 Top-N（按次数降序，同频按类型名升序）")
    void summaryCountsAndOrdersByFrequency() {
        TelemetryService service = service(50);
        // 5 条 boss_defeated、3 条 pickup、3 条 dungeon_cleared、2 条 quest_completed、1 条 save
        for (int i = 0; i < 5; i++) service.record("boss_defeated", "void-chronarch");
        for (int i = 0; i < 3; i++) service.record("pickup", "gem");
        for (int i = 0; i < 3; i++) service.record("dungeon_cleared", "maw");
        for (int i = 0; i < 2; i++) service.record("quest_completed", "q1");
        service.record("save", "slot1");

        Map<String, Object> summary = service.summarize(4);
        assertEquals(14, summary.get("windowSize"));
        assertEquals(5, summary.get("distinctTypes"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byType = (List<Map<String, Object>>) summary.get("byType");
        // topN=4：boss_defeated(5) + {dungeon_cleared(3), pickup(3) 同频升序} + quest_completed(2)
        assertEquals(4, byType.size());
        assertEquals("boss_defeated", byType.get(0).get("type"));
        assertEquals(5L, byType.get(0).get("count"));
        assertEquals("dungeon_cleared", byType.get(1).get("type"));
        assertEquals("pickup", byType.get(2).get("type"));
        assertEquals(3L, byType.get(1).get("count"));
        assertEquals(3L, byType.get(2).get("count"));
        assertEquals("quest_completed", byType.get(3).get("type"));
        // save(1) 被 Top-4 截掉
        assertTrue(byType.stream().noneMatch(e -> "save".equals(e.get("type"))));
    }

    @Test
    @DisplayName("topN 夹到 [1, 20]：问 0 至少给 1 条，问 1000 最多 20 条")
    void topNIsClamped() {
        TelemetryService service = service(50);
        for (int i = 0; i < 30; i++) service.record("type_" + (i % 30), "d");

        Map<String, Object> tiny = service.summarize(0);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tinyList = (List<Map<String, Object>>) tiny.get("byType");
        assertEquals(1, tinyList.size(), "topN=0 应夹到 1");

        Map<String, Object> huge = service.summarize(1000);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hugeList = (List<Map<String, Object>>) huge.get("byType");
        assertEquals(20, hugeList.size(), "topN=1000 应夹到 20");
    }
}
