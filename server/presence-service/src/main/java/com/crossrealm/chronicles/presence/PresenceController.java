package com.crossrealm.chronicles.presence;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 在场 REST + SSE 面（W-Z-同游）。
 *
 * 三条路由，全部落在网关 `/api/presence/**` 后面：
 * - `POST /api/presence/{channel}/beat`  心跳：写入状态 + 扇出广播 → 202（非幂等，网关不重试）
 * - `GET  /api/presence/{channel}/count` 当前在场人数（HUD 用，免 SSE）
 * - `GET  /api/presence/{channel}/stream` SSE：先推快照，再实时推后续心跳
 *
 * 校验口径（防滥用、防坏数据进入 Redis/广播）：
 * - channel 限定 `[A-Za-z0-9_-]{1,32}`；id 同理 `{1,40}`。
 * - name 去控制字符、裁剪到 24 字、空则 400。
 * - hue 归一到 [0,359]，x/z 夹紧到 [-1,1] 且必须有限；非法 → 400。
 * - 单频道成员超 `maxWanderersPerChannel` → 429。
 */
@RestController
@RequestMapping("/api/presence")
public class PresenceController {

    private static final Pattern CHANNEL_RE = Pattern.compile("^[A-Za-z0-9_-]{1,32}$");
    private static final Pattern ID_RE = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
    private static final int NAME_MAX = 24;
    private static final long SSE_TIMEOUT_MS = 60_000L;
    private static final long KEEPALIVE_MS = 15_000L;

    private final PresenceStore store;
    private final PresenceEventHub hub;
    private final PresenceProperties props;
    private final ScheduledExecutorService scheduler;

    public PresenceController(PresenceStore store, PresenceEventHub hub,
                              PresenceProperties props, ScheduledExecutorService scheduler) {
        this.store = store;
        this.hub = hub;
        this.props = props;
        this.scheduler = scheduler;
    }

    @PostMapping("/{channel}/beat")
    public ResponseEntity<Map<String, Object>> beat(@PathVariable String channel,
                                                    @RequestBody Map<String, Object> body) {
        if (!CHANNEL_RE.matcher(channel).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid channel");
        }
        Wanderer w = sanitize(channel, body);
        if (store.memberCount(channel) >= props.getMaxWanderersPerChannel()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "channel full");
        }
        // 服务端打 ts：存状态与推 fanout 共用同一份（live SSE 帧的 ts 才不会变回 0）
        // store 内部仍会再打一次（毫秒级，方向一致），这里负责让广播层看到真实时间
        Wanderer stamped = new Wanderer(w.id(), w.name(), w.hue(), w.x(), w.z(), System.currentTimeMillis());
        store.upsert(channel, stamped);
        hub.publish(channel, stamped);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", true);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(r);
    }

    @GetMapping("/{channel}/count")
    public Map<String, Object> count(@PathVariable String channel) {
        if (!CHANNEL_RE.matcher(channel).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid channel");
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("channel", channel);
        r.put("count", store.snapshot(channel).size());
        return r;
    }

    @GetMapping(value = "/{channel}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String channel, HttpServletResponse response) {
        if (!CHANNEL_RE.matcher(channel).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid channel");
        }
        // 关掉代理缓冲（X-Accel-Buffering 给 nginx；Cache-Control 给浏览器/中间层），让 SSE 真的流式。
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Accel-Buffering", "no");

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        // 1) 先推当前快照（只读新鲜者），再发一个 snapshot-end 让前端知道"初始名单齐了"
        try {
            for (Wanderer w : store.snapshot(channel).values()) {
                send(emitter, "present", w.toJson());
            }
            send(emitter, "snapshot-end", "{}");
        } catch (IOException e) {
            emitter.completeWithError(e);
            return emitter;
        }

        // 2) 订阅频道实时心跳；任意新游侠进来立刻推给这条 SSE 连接
        AutoCloseable sub = hub.subscribe(channel, (Consumer<Wanderer>) w -> {
            try {
                send(emitter, "present", w.toJson());
            } catch (IOException ignore) {
                // 客户端已断：completion/timeout 回调会清理，这里静默
            }
        });

        // 3) 保活 ping：每 15s 发一个注释，防止网关/代理把长连接当空闲掐掉
        ScheduledFuture<?> ping = scheduler.scheduleAtFixedRate(() -> {
            try {
                synchronized (emitter) {
                    emitter.send(SseEmitter.event().comment("ping"));
                }
            } catch (IOException ignore) {
                // 断线：交给清理回调
            }
        }, KEEPALIVE_MS, KEEPALIVE_MS, TimeUnit.MILLISECONDS);

        Runnable cleanup = () -> {
            ping.cancel(true);
            try {
                sub.close();
            } catch (Exception ignore) {
                // 取消订阅失败不致命
            }
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError((e) -> cleanup.run());

        return emitter;
    }

    private static void send(SseEmitter emitter, String event, String data) throws IOException {
        synchronized (emitter) {
            emitter.send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
        }
    }

    /** 从请求体构造并校验一位游侠；非法字段 → 400。 */
    private Wanderer sanitize(String channel, Map<String, Object> body) {
        Object idRaw = body.get("id");
        Object nameRaw = body.get("name");
        if (!(idRaw instanceof String) || !ID_RE.matcher(((String) idRaw)).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid id");
        }
        String name = sanitizeName(nameRaw);
        double hue = clampHue(toDouble(body.get("hue")));
        double x = clampCoord(toDouble(body.get("x")));
        double z = clampCoord(toDouble(body.get("z")));
        // store.upsert 会用服务端时间打 ts，这里不传 ts
        return new Wanderer((String) idRaw, name, (int) hue, x, z, 0L);
    }

    private static String sanitizeName(Object raw) {
        String s = raw instanceof String ? (String) raw : "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length() && b.length() < NAME_MAX; i++) {
            char c = s.charAt(i);
            // 去掉控制字符（含换行/tab），其余保留
            if (c < 0x20 || c == 0x7f) {
                b.append(' ');
            } else {
                b.append(c);
            }
        }
        String trimmed = b.toString().trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty name");
        }
        return trimmed;
    }

    private static double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException e) {
                return 0d;
            }
        }
        return 0d;
    }

    private static double clampHue(double h) {
        if (!Double.isFinite(h)) return 0d;
        return ((h % 360) + 360) % 360;
    }

    private static double clampCoord(double v) {
        if (!Double.isFinite(v)) return 0d;
        return Math.max(-1d, Math.min(1d, v));
    }
}
