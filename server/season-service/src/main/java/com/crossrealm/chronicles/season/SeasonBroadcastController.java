package com.crossrealm.chronicles.season;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * W-M5：测试/联调用「换季广播」发布端点。
 *
 * <p>为什么单独一个控制器：生产 {@code spring.cache.type} 不是 redis 时这一整条根本不存在；
 * test-enabled 只给 CI/联调环境用。生产环境即使有 redis，但<b>没有这个 property</b>，
 * 端点就不会被注册，不存在泄漏面。
 *
 * <p>发布后，game-service（如果配了同样 redis 的 {@code spring.cache.type=redis}）会立刻收到，
 * 清掉自己的 seasonCache；本端点只是给"换季"一个明确触发点（避免等一天才能观察到）。
 */
@RestController
@ConditionalOnProperty(name = "season-service.broadcast.test-enabled", havingValue = "true")
public class SeasonBroadcastController {

    public static final String CHANNEL = "crossrealm:season:advance";

    private final SeasonCatalog catalog;
    private final org.springframework.data.redis.core.StringRedisTemplate redis;

    public SeasonBroadcastController(SeasonCatalog catalog,
                                      @org.springframework.lang.Nullable
                                      org.springframework.data.redis.core.StringRedisTemplate redis) {
        this.catalog = catalog;
        this.redis = redis;
    }

    @PostMapping("/api/seasons/broadcast")
    public Map<String, Object> publish() {
        if (redis == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "redis not configured");
        }
        Season active = catalog.active();
        String payload = """
                {"event":"season:advance","id":"%s","dayInCycle":%d}""".formatted(
                active.id(), catalog.dayInCycle());
        try {
            redis.convertAndSend(CHANNEL, payload);
        } catch (RuntimeException e) {
            // Pub/Sub 是 fire-and-forget：Redis 不可达时不能让这个端点把 500 抛给调用方，
            // 更不能假装发布成功。503 明确表示「这次没发出去，订阅方仍会等 TTL 自然过期」。
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "redis publish failed", e);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("published", true);
        result.put("channel", CHANNEL);
        result.put("id", active.id());
        result.put("dayInCycle", catalog.dayInCycle());
        return result;
    }
}
