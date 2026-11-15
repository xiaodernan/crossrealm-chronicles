package com.crossrealm.chronicles.game.telemetry;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.ConfigurableBeanFactory;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Counter;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * W-Z130 —— 可选的 Postgres 落地盘。
 *
 * <p><b>为什么和 deque 不混</b>：现在的 W-M1 入队只提供「单机内存滚动」的复盘用途；
 * 炉边盘需要跨进程、跨重启的统计，于是真数据库顶上。我们不想让一个慢的插入把
 * 请求线程拖垮，于是抄 W-M1 的形态：单消费者 + 有界 4096 格队列 + 背压计数 + at-most-once。
 *
 * <p><b>启动时探一次连接</b>：disabled 或 URL 连不上 ⇒ 打一行 WARN 后自我关闭，
 * 游戏继续纯内存运行（黑色降级）—— 这是刻意的设计：DB 是加成不是命脉。
 *
 * <p><b>30 秒查询缓存</b>：读侧用 volatile 缓存 + 时间戳；不改 Spring Cache 类型
 * （不是 Redis 就没必要假动作），单连接上做真读比堆得快。
 *
 * <p><b>flush 粒度</b>：每 250ms 或 100 条事件，单事务批量 INSERT（telemetry_events）
 * + UPSERT rollup（telemetry_daily_rollup, day, type, count+1）—— 一个事务写两张表。
 */
@Component
public class TelemetryJdbcSink {

    private static final Logger log = LoggerFactory.getLogger(TelemetryJdbcSink.class);
    private static final int QUEUE_CAPACITY = 4096;
    private static final int FLUSH_SIZE = 100;
    private static final long CACHE_TTL_MS = 30_000L;

    @Value("${game-service.telemetry.jdbc.enabled:false}")
    private boolean enabled;
    @Value("${game-service.telemetry.jdbc.url:}")
    private String url;
    @Value("${game-service.telemetry.jdbc.user:}")
    private String user;
    @Value("${game-service.telemetry.jdbc.password:}")
    private String password;

    private final BlockingQueue<TelemetryEvent> queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final AtomicLong enqueued = new AtomicLong();
    private final AtomicLong dropped = new AtomicLong();
    private final AtomicLong written = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final Counter dbEnqueued;
    private final Counter dbDropped;
    private final Counter dbWritten;
    private final Counter dbFailures;
    private volatile Connection readConnection;
    private volatile List<Map<String, Object>> cachedRollup = null;
    private volatile long cachedRollupAt = 0L;

    private Thread writer;

    @Autowired(required = false)
    public TelemetryJdbcSink(@org.springframework.lang.Nullable MeterRegistry meterRegistry) {
        this.dbEnqueued = meterRegistry != null ? meterRegistry.counter("game_telemetry_db_enqueued_total") : null;
        this.dbDropped  = meterRegistry != null ? meterRegistry.counter("game_telemetry_db_dropped_total") : null;
        this.dbWritten  = meterRegistry != null ? meterRegistry.counter("game_telemetry_db_written_total") : null;
        this.dbFailures = meterRegistry != null ? meterRegistry.counter("game_telemetry_db_failures_total") : null;
    }

    @PostConstruct
    void start() {
        if (!enabled) {
            log.info("[telemetry-jdbc] disabled — game-service runs with the in-memory only pipeline");
            return;
        }
        if (url == null || url.isBlank()) {
            log.warn("[telemetry-jdbc] enabled but game-service.telemetry.jdbc.url is blank — sink self-closed");
            enabled = false;
            return;
        }
        // 启动时探一次连接；失败 ⇒ 自我关闭（游戏继续内存运行）
        try (Connection probe = DriverManager.getConnection(url, user, password)) {
            probe.isValid(3);
            log.info("[telemetry-jdbc] connected to {} — sink enabled", url);
        } catch (Exception e) {
            log.warn("[telemetry-jdbc] connect probe failed — sink self-closed; game-service runs in-memory only. cause={}", e.getMessage());
            enabled = false;
            return;
        }
        writer = new Thread(this::flushLoop, "telemetry-jdbc-writer");
        writer.setDaemon(true);
        writer.start();
    }

    @PreDestroy
    void stop() {
        running.set(false);
        if (writer != null) {
            writer.interrupt();
            try { writer.join(1500); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
        flush(FLUSH_SIZE);
        closeRead();
    }

    /** 非阻塞；队列满 → 记 dropped，不影响请求线程 */
    public void offer(TelemetryEvent event) {
        if (!enabled) return;
        enqueued.incrementAndGet();
        if (dbEnqueued != null) dbEnqueued.increment();
        if (!queue.offer(event)) {
            dropped.incrementAndGet();
            if (dbDropped != null) dbDropped.increment();
        }
    }

    private void flushLoop() {
        while (running.get()) {
            List<TelemetryEvent> batch = drainBatch(FLUSH_SIZE);
            if (!batch.isEmpty()) {
                writeBatch(batch);
            }
            try {
                if (batch.isEmpty()) Thread.sleep(250);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        // final drain
        for (;;) {
            List<TelemetryEvent> batch = drainBatch(FLUSH_SIZE);
            if (batch.isEmpty()) break;
            writeBatch(batch);
        }
    }

    private List<TelemetryEvent> drainBatch(int max) {
        List<TelemetryEvent> batch = new ArrayList<>(max);
        for (int i = 0; i < max; i++) {
            TelemetryEvent e = queue.poll();
            if (e == null) break;
            batch.add(e);
        }
        return batch;
    }

    private void flush(int max) {
        for (;;) {
            List<TelemetryEvent> batch = drainBatch(max);
            if (batch.isEmpty()) return;
            writeBatch(batch);
        }
    }

    private void writeBatch(List<TelemetryEvent> batch) {
        String eventsSql = "INSERT INTO telemetry_events(type, detail, received_at) VALUES (?, ?, now())";
        String rollupSql = "INSERT INTO telemetry_daily_rollup(day, type, count) VALUES (CURRENT_DATE, ?, ?) "
                + "ON CONFLICT (day, type) DO UPDATE SET count = telemetry_daily_rollup.count + EXCLUDED.count";
        try (Connection c = DriverManager.getConnection(url, user, password)) {
            c.setAutoCommit(false);
            try (PreparedStatement pEvents = c.prepareStatement(eventsSql);
                 PreparedStatement pRollup = c.prepareStatement(rollupSql)) {
                Map<String, Long> perType = new LinkedHashMap<>();
                for (TelemetryEvent e : batch) {
                    pEvents.setString(1, e.type());
                    pEvents.setString(2, truncate(e.detail(), 512));
                    pEvents.addBatch();
                    perType.merge(e.type(), 1L, Long::sum);
                }
                for (var en : perType.entrySet()) {
                    pRollup.setString(1, en.getKey());
                    pRollup.setLong(2, en.getValue());
                    pRollup.addBatch();
                }
                pEvents.executeBatch();
                pRollup.executeBatch();
                c.commit();
                long n = batch.size();
                written.addAndGet(n);
                if (dbWritten != null) dbWritten.increment(n);
            } catch (SQLException inner) {
                c.rollback();
                throw inner;
            }
        } catch (Exception e) {
            failures.addAndGet(batch.size());
            if (dbFailures != null) dbFailures.increment(batch.size());
            log.warn("[telemetry-jdbc] batch write failed (size={}): {}", batch.size(), e.getMessage());
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** 14 天 roll-up；30 秒缓存；未启用返回 enabled=false */
    public Map<String, Object> summaryRollup() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled);
        if (!enabled) {
            out.put("reason", "jdbc-disabled");
            return out;
        }
        List<Map<String, Object>> rows = cachedRollup;
        long now = System.currentTimeMillis();
        if (rows == null || now - cachedRollupAt > CACHE_TTL_MS) {
            rows = queryRollup();
            cachedRollup = rows;
            cachedRollupAt = now;
        }
        // 按 type 聚合 + 按 day 聚合
        Map<String, Long> totals = new LinkedHashMap<>();
        List<Map<String, Object>> daily = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String type = (String) row.get("type");
            long count = ((Number) row.get("count")).longValue();
            totals.merge(type, count, Long::sum);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("day", row.get("day"));
            d.put("type", type);
            d.put("count", count);
            daily.add(d);
        }
        out.put("days", 14);
        out.put("totals", totals);
        out.put("total", totals.values().stream().mapToLong(Long::longValue).sum());
        out.put("byDayAndType", daily);
        return out;
    }

    private List<Map<String, Object>> queryRollup() {
        try {
            if (readConnection == null || readConnection.isClosed()) {
                readConnection = DriverManager.getConnection(url, user, password);
            }
            List<Map<String, Object>> rows = new ArrayList<>();
            try (PreparedStatement ps = readConnection.prepareStatement(
                    "SELECT day::text AS day, type, count FROM telemetry_daily_rollup "
                            + "WHERE day >= (CURRENT_DATE - INTERVAL '14 days') ORDER BY day, type")) {
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("day", rs.getString("day"));
                        row.put("type", rs.getString("type"));
                        row.put("count", rs.getLong("count"));
                        rows.add(row);
                    }
                }
            }
            return rows;
        } catch (SQLException e) {
            log.warn("[telemetry-jdbc] rollup query failed: {}", e.getMessage());
            closeRead();
            return List.of();
        }
    }

    private void closeRead() {
        try {
            if (readConnection != null && !readConnection.isClosed()) readConnection.close();
        } catch (SQLException ignore) { /* already closed */ }
        readConnection = null;
    }

    /** 给 /api/ops/stats 用 — 纯内存计数器，不阻塞 */
    public Map<String, Object> stats() {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("enabled", enabled ? 1L : 0L);
        m.put("enqueued", enqueued.get());
        m.put("dropped", dropped.get());
        m.put("written", written.get());
        m.put("failures", failures.get());
        m.put("depth", (long) queue.size());
        return m;
    }
}
