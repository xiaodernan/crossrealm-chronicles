package com.crossrealm.chronicles.notify;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 炉火报讯台 —— 跨微服务的通知 / 广播登记处。
 *
 * <p>写入：POST {@code /api/notify}（校验 → 台账 push → Pub/Sub 广播 fire-and-forget）。
 * 读取：GET {@code /api/notify/recent?limit=N}（新的在前）、GET {@code /api/notify/stats}
 * （按 kind 计数 + 台账深度）。
 *
 * <p>为什么<b>不</b>把广播失败判成 503：台账（记忆）才是本服务的本体；Pub/Sub 是给在线
 * 订阅方的「实时门铃」，Redis 订阅断了、本实例发不出去时，订阅方仍能在下一次
 * {@code /recent} 轮询里拿到这条——所以广播失败只在响应里标 {@code broadcast:false}，
 * 不写 503。只有台账 push 失败才 503（那说明「连记忆都记不下」，这是真故障）。
 */
@RestController
@Validated
public class NotifyController {

    public static final String KIND_PATTERN = "achievement|season|world|system";
    static final int MAX_LIMIT = 50;
    static final int DEFAULT_LIMIT = 10;
    /** 报讯广播频道（season Advance 同族的 Pub/Sub 命名约定）。 */
    public static final String CHANNEL = RedisNotificationLedger.CHANNEL;

    private final NotificationLedger ledger;
    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final ObjectMapper mapper = new ObjectMapper();

    public NotifyController(NotificationLedger ledger,
                            ObjectProvider<StringRedisTemplate> redisProvider) {
        this.ledger = ledger;
        this.redisProvider = redisProvider;
    }

    @PostMapping("/api/notify")
    public ResponseEntity<Map<String, Object>> publish(@Valid @RequestBody NotifyRequest req) {
        Notification n = Notification.of(req.kind(), req.title().trim(), req.body().trim());
        ledger.push(n); // 台账失败 → IllegalStateException → 503（@ExceptionHandler）

        boolean broadcast = broadcast(n);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", n.id());
        out.put("kind", n.kind());
        out.put("ts", n.ts());
        out.put("stored", true);
        out.put("broadcast", broadcast);
        out.put("channel", CHANNEL);
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @GetMapping("/api/notify/recent")
    public Map<String, Object> recent(@RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
        int clamped = Math.max(1, Math.min(MAX_LIMIT, limit));
        List<Notification> items = ledger.recent(clamped);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("limit", clamped);
        out.put("count", items.size());
        out.put("items", items);
        return out;
    }

    @GetMapping("/api/notify/stats")
    public Map<String, Object> stats() {
        Map<String, Long> byKind = ledger.countsByKind();
        long total = byKind.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stored", ledger.size());
        out.put("totalPublished", total);
        out.put("byKind", byKind);
        out.put("backend", ledger.backend());
        return out;
    }

    /**
     * W-Z52：报讯台运维只读白名单（presence `/ops` 同族）——
     * 给 /api/ops/health 聚合与人肉排障用。白名单里没有任何玩家内容：
     * 后端实现、台账深度、容量、按 kind 的发布计数、频道名。
     * 无鉴权也安全（全是数字和固定字符串），与 presence ops 同一口径。
     */
    @GetMapping("/api/notify/ops")
    public Map<String, Object> ops() {
        Map<String, Long> byKind = ledger.countsByKind();
        long total = byKind.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("backend", ledger.backend());
        out.put("stored", ledger.size());
        out.put("capacity", MAX_LIMIT);
        out.put("totalPublished", total);
        out.put("byKind", byKind);
        out.put("channel", CHANNEL);
        return out;
    }

    /** 台账写失败统一 503；不让它变成 Spring 默认 500（调用方看不懂是哪坏了）。 */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> ledgerUnavailable(IllegalStateException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "notify-ledger-unavailable");
        body.put("reason", e.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    /** Pub/Sub 广播：fire-and-forget 的明确边界 —— 失败只标记，不抛。 */
    private boolean broadcast(Notification n) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return false; // 内存模式：没有频道可发，广播=false，这是预期状态
        }
        try {
            String payload = mapper.writeValueAsString(Map.of(
                    "event", "notify:radiate",
                    "id", n.id(),
                    "kind", n.kind(),
                    "title", n.title(),
                    "ts", n.ts()));
            Long receivers = redis.convertAndSend(CHANNEL, payload);
            return receivers != null && receivers >= 0;
        } catch (Exception e) {
            return false; // 订阅方断了不在本服务的责任范围内；/recent 轮询还能兜住
        }
    }

    public record NotifyRequest(
            @NotBlank @Pattern(regexp = KIND_PATTERN,
                    message = "kind 必须是 achievement | season | world | system 之一")
            String kind,
            @NotBlank @Size(max = 120, message = "title 最长 120 字")
            String title,
            @NotBlank @Size(max = 500, message = "body 最长 500 字")
            String body) {
    }
}
