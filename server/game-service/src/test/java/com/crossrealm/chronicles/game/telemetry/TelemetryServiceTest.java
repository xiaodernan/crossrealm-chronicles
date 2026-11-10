package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
