package com.crossrealm.chronicles.game.leaderboard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.crossrealm.chronicles.game.GameServiceProperties;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Live test for Redis mirror: submit -> JVM dies -> new JVM pulls records back.
 *
 * <p>Skipped when no Redis reachable (same discipline as RedisStreamAdvisorQueueLiveTest).
 * REDIS_HOST / REDIS_PORT to override target.
 */
class RedisLeaderboardMirrorLiveTest {

    private static String host;
    private static int port;
    private static boolean reachable;
    private static StringRedisTemplate redis;

    @BeforeAll
    static void probeRedis() {
        host = System.getenv().getOrDefault("REDIS_HOST", "localhost");
        try {
            port = Integer.parseInt(System.getenv().getOrDefault("REDIS_PORT", "6379"));
        } catch (NumberFormatException e) {
            port = 6379;
        }
        try {
            LettuceConnectionFactory probe = new LettuceConnectionFactory(
                    new RedisStandaloneConfiguration(host, port));
            probe.afterPropertiesSet();
            probe.getConnection().ping();
            probe.destroy();
            LettuceConnectionFactory factory = new LettuceConnectionFactory(
                    new RedisStandaloneConfiguration(host, port));
            factory.afterPropertiesSet();
            redis = new StringRedisTemplate(factory);
            redis.getConnectionFactory().getConnection().serverCommands().flushAll();
            reachable = true;
        } catch (RuntimeException e) {
            reachable = false;
        }
    }

    @BeforeEach
    void resetZset() {
        if (!reachable) return;
        redis.delete("leaderboard:runs");
    }

    private static GameServiceProperties props() {
        GameServiceProperties p = new GameServiceProperties();
        p.getLeaderboard().setSeedDemoData(false);
        p.getLeaderboard().setBackend("redis");
        return p;
    }

    private static String now() {
        return Instant.now().toString();
    }

    @Test
    void 提交后镜像写入_重启后可完整恢复() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        LeaderboardRedisMirror mirror = new LeaderboardRedisMirror(redis);
        LeaderboardService first = new LeaderboardService(props(), mirror);
        first.add(new RunRecord("silver-leaf", "guardian-alpha", 8_000L, 1, now()));
        first.add(new RunRecord("shadow-dancer", "guardian-alpha", 9_000L, 1, now()));
        first.add(new RunRecord("crimson-gavel", "guardian-alpha", 10_000L, 1, now()));

        assertEquals(3L, redis.opsForZSet().zCard("leaderboard:runs"));

        LeaderboardRedisMirror mirror2 = new LeaderboardRedisMirror(redis);
        LeaderboardService second = new LeaderboardService(props(), mirror2);
        second.seedDemoData();

        List<RunRecord> top = second.top(3);
        assertEquals(3, top.size());
        assertEquals("silver-leaf", top.get(0).runner());
        assertEquals(8_000L, top.get(0).clearTimeMs());
    }

    @Test
    void 幂等追加_重启不重复() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        LeaderboardRedisMirror mirror1 = new LeaderboardRedisMirror(redis);
        LeaderboardService first = new LeaderboardService(props(), mirror1);
        first.add(new RunRecord("amber", "boss-one", 7_000L, 1, now()));
        first.add(new RunRecord("blue", "boss-one", 7_000L, 1, now()));
        assertEquals(2L, redis.opsForZSet().zCard("leaderboard:runs"));

        LeaderboardRedisMirror mirror2 = new LeaderboardRedisMirror(redis);
        LeaderboardService second = new LeaderboardService(props(), mirror2);
        second.seedDemoData();
        assertEquals(2, second.top(10).size());
    }

    @Test
    void 损坏行容错() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        redis.opsForZSet().add("leaderboard:runs", "{not-json", 1L);

        LeaderboardRedisMirror mirror = new LeaderboardRedisMirror(redis);
        LeaderboardService svc = new LeaderboardService(props(), mirror);
        svc.seedDemoData();
        assertTrue(svc.top(10).isEmpty(), "corrupt row skipped, no exception");
    }

    @Test
    void memory_backend仍然是_默认() {
        LeaderboardService svc = new LeaderboardService(new GameServiceProperties());
        svc.add(new RunRecord("default", "boss-one", 6_000L, 1, now()));
        Map<String, Object> stats = svc.stats();
        assertEquals(1, stats.get("total"));
    }
}
