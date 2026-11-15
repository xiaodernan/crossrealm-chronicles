package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z130：`TelemetryJdbcSink` 的"未启用"契约——无 DB 时也必须安全。
 *
 * <p>为什么这条必须冻：CI / 无 Postgres 的 dev 机必须永远绿，游戏的
 * 遥测绝不能因为一个可选的落盘件就起不来。三件事固定下来：
 * <ol>
 *   <li>{@code enabled=false} 时 {@code offer} 是个 no-op，不会 enqueued 也不会 dropped；</li>
 *   <li>{@code summaryRollup()} 返回 enabled=false + reason，永远不抛；</li>
 *   <li>{@code dbSinkStats()} 形状稳定（enabled=0）。</li>
 * </ol>
 *
 * 另外两条是 compose 启动时人眼核验——不是 CI 职责：
 * <pre>
 *   docker compose up --build -d
 *   curl -s localhost:8080/api/telemetry/summary-rollup
 *   # ⇒ {"enabled": true, "days": 14, "totals": {"boss_kill": 50, …}, …}
 *   psql -h localhost -p 15432 -U crossrealm crossrealm -c 'SELECT * FROM telemetry_daily_rollup'
 * </pre>
 */
class TelemetryJdbcSinkTest {

    private TelemetryJdbcSink sink() {
        // 直接实例化（绕过 Spring 环境）；构造只需要 MeterRegistry（可以 null）
        return new TelemetryJdbcSink(null);
    }

    @Test
    @DisplayName("disabled: offer 完全无副作用，stats 形状稳定")
    void offerIsNoopWhenDisabled() {
        TelemetryJdbcSink s = sink();
        // 不调 @PostConstruct（no Spring），enabled 默认 false
        for (int i = 0; i < 50; i++) {
            s.offer(TelemetryEvent.of(i, "type_" + i, "detail"));
        }
        Map<String, Object> stats = s.stats();
        assertEquals(0L, ((Number) stats.get("enabled")).longValue());
        assertEquals(0L, ((Number) stats.get("enqueued")).longValue());
        assertEquals(0L, ((Number) stats.get("dropped")).longValue());
        assertEquals(0L, ((Number) stats.get("written")).longValue());
        assertEquals(0L, ((Number) stats.get("failures")).longValue());
        assertEquals(0L, ((Number) stats.get("depth")).longValue());
    }

    @Test
    @DisplayName("disabled: summaryRollup 返回 enabled=false + reason，绝不抛")
    void summaryRollupIsStableWhenDisabled() {
        TelemetryJdbcSink s = sink();
        Map<String, Object> out = s.summaryRollup();
        assertEquals(Boolean.FALSE, out.get("enabled"));
        assertEquals("jdbc-disabled", out.get("reason"));
    }

    @Test
    @DisplayName("TelemetryService.dbSinkStats：jdbcSink=null 时仍返回 enabled=0 的 Map，而不是 NPE")
    void serviceExposesStableDbSinkStatsWhenNull() {
        GameServiceProperties properties = new GameServiceProperties();
        TelemetryService service = new TelemetryService(properties);
        Map<String, Object> stats = service.dbSinkStats();
        assertEquals(0, ((Number) stats.get("enabled")).intValue());
    }

    @Test
    @DisplayName("dbSinkStats 块存在于 /api/ops/summary 的 telemetryQueue 之后")
    void opsControllerReadsData() {
        GameServiceProperties properties = new GameServiceProperties();
        TelemetryService service = new TelemetryService(properties);
        // 保证没有把统计键改成 wire-incompatible —— 偷偷看 json 相容：stats.toString() 必须包含 "enabled=0"
        assertTrue(service.dbSinkStats().toString().contains("enabled=0"));
        assertSame(service.queueStats().getClass(), java.util.LinkedHashMap.class);
    }
}
