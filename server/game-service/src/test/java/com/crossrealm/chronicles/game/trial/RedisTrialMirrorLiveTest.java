package com.crossrealm.chronicles.game.trial;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
 * Live test for Trial Redis mirror: submit -> JVM dies -> new JVM pulls records back.
 *
 * <p>Skipped when no Redis is reachable (same discipline as RedisStreamAdvisorQueueLiveTest).
 * Set REDIS_HOST / REDIS_PORT to override target.
 */
class RedisTrialMirrorLiveTest {

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
        redis.delete("trial-leaderboard:runs");
    }

    private static GameServiceProperties props() {
        GameServiceProperties p = new GameServiceProperties();
        p.getTrial().setSeedDemoData(false);
        p.getTrial().setBackend("redis");
        return p;
    }

    private static String now() {
        return Instant.now().toString();
    }

    @Test
    void 提交后重启后完整恢复() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        TrialRedisMirror mirror = new TrialRedisMirror(redis);
        TrialLeaderboardService first = new TrialLeaderboardService(props(), mirror);
        first.add(new TrialRun("lantern-bearer", "ember", 9000, 5, 47, now()));
        first.add(new TrialRun("bridge-warden", "ember", 8200, 4, 22, now()));
        first.add(new TrialRun("abyss-scribe", "gloom", 6100, 3, 10, now()));

        assertEquals(3L, redis.opsForZSet().zCard("trial-leaderboard:runs"));

        TrialRedisMirror mirror2 = new TrialRedisMirror(redis);
        TrialLeaderboardService second = new TrialLeaderboardService(props(), mirror2);
        second.seedDemoData();

        List<TrialRun> top = second.top("ember", 10);
        assertEquals(2, top.size());
        assertEquals("lantern-bearer", top.get(0).runner());
        assertEquals(9000, top.get(0).score());
    }

    @Test
    void season_过滤恢复() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        TrialRedisMirror mirror = new TrialRedisMirror(redis);
        TrialLeaderboardService first = new TrialLeaderboardService(props(), mirror);
        first.add(new TrialRun("alpha", "ember", 5000, 3, 10, now()));
        first.add(new TrialRun("beta", "gloom", 7500, 4, 23, now()));

        TrialRedisMirror mirror2 = new TrialRedisMirror(redis);
        TrialLeaderboardService second = new TrialLeaderboardService(props(), mirror2);
        second.seedDemoData();

        assertEquals(1, second.top("ember", 10).size());
        assertEquals(1, second.top("gloom", 10).size());
    }

    @Test
    void score_降序_键序一致() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        TrialRedisMirror mirror = new TrialRedisMirror(redis);
        TrialLeaderboardService first = new TrialLeaderboardService(props(), mirror);
        first.add(new TrialRun("top", "ember", 9000, 5, 30, now()));
        first.add(new TrialRun("mid", "ember", 6500, 4, 18, now()));
        first.add(new TrialRun("low", "ember", 4200, 2, 7, now()));

        TrialRedisMirror mirror2 = new TrialRedisMirror(redis);
        TrialLeaderboardService second = new TrialLeaderboardService(props(), mirror2);
        second.seedDemoData();

        List<TrialRun> top = second.top("ember", 10);
        assertEquals("top", top.get(0).runner());
        assertEquals("mid", top.get(1).runner());
        assertEquals("low", top.get(2).runner());
    }

    @Test
    void 损坏行被跳过() {
        Assumptions.assumeTrue(reachable, "no Redis -- skip");

        redis.opsForZSet().add("trial-leaderboard:runs", "{broken-json", 8_000.0);
        assertEquals(1L, redis.opsForZSet().zCard("trial-leaderboard:runs"));
        TrialRedisMirror mirror = new TrialRedisMirror(redis);
        TrialLeaderboardService svc = new TrialLeaderboardService(props(), mirror);
        svc.seedDemoData();
        assertTrue(svc.top("ember", 10).isEmpty(), "corrupt row skipped");
    }

    @Test
    void memory_backend仍然是_默认() {
        TrialLeaderboardService svc = new TrialLeaderboardService(new GameServiceProperties());
        svc.add(new TrialRun("runner", "ember", 4000, 2, 5, now()));
        Map<String, Object> stats = svc.stats();
        assertEquals(1, stats.get("total"));
    }
}
