package com.crossrealm.chronicles.game.idem;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

/**
 * 幂等提交过滤器（W-Z65）：`POST /api/leaderboard`、`POST /api/trials/runs` 支持
 * 可选 `X-Idempotency-Key`（{@value #HEADER}）。
 *
 * <p>契约：
 * <ul>
 *   <li><b>未提供 key 的请求永远不走幂等路径</b>——行为与改造前完全一致（零拦截、零开销）</li>
 *   <li>key 必须匹配 {@value #KEY_REGEX}，否则 400 `{"error":"invalid-idempotency-key"}`</li>
 *   <li>同 key + 同 body → 原样重放当年那次的响应（2xx 才入台），`X-Idempotent-Replayed: true`</li>
 *   <li>同 key + 不同 body → 409 `{"error":"idempotency-key-conflict"}`，业务永远不到服务层</li>
 *   <li>台账异常/过期 → 按未命中处理（fail-open，请求照旧落到后端——台账不挡业务）</li>
 *   <li>内存默认（{@link InMemoryIdempotencyStore} LRU + TTL）；`backend=redis` 走跨实例共享台账</li>
 * </ul>
 */
@Component
public class IdempotencyFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Idempotency-Key";
    public static final String REPLAY_HEADER = "X-Idempotent-Replayed";

    private static final Logger LOG = LoggerFactory.getLogger(IdempotencyFilter.class);
    private static final String KEY_REGEX = "^[A-Za-z0-9_-]{1,128}$";
    private static final Pattern KEY_RE = Pattern.compile(KEY_REGEX);
    private static final Set<String> PATHS = Set.of("/api/leaderboard", "/api/trials/runs");
    private static final String CT = "application/json;charset=UTF-8";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** 幂等只为小 JSON 生效；超过此上限的请求一律 413（拒绝，不读不缓存，不半途放行） */
    private static final int MAX_BODY_BYTES = 64 * 1024;

    private final InMemoryIdempotencyStore fallback;
    @Nullable
    private final IdempotencyStore redisStore;
    private final boolean enabled;
    private final long ttlMs;

    @Autowired
    public IdempotencyFilter(GameServiceProperties properties,
                             @Nullable IdempotencyStore redisStore) {
        this.enabled = properties.getIdempotency().isEnabled();
        this.ttlMs = Math.max(0L, properties.getIdempotency().getTtlSeconds()) * 1000L;
        this.fallback = new InMemoryIdempotencyStore(
                properties.getIdempotency().getMaxEntries(),
                properties.getIdempotency().getTtlSeconds());
        this.redisStore = redisStore;
    }

    private IdempotencyStore store() {
        return redisStore != null ? redisStore : fallback;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod()) || !PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        if (!enabled) {
            chain.doFilter(request, response);
            return;
        }
        String key = request.getHeader(HEADER);
        if (key == null || key.isBlank()) {
            chain.doFilter(request, response);
            return;
        }
        if (!KEY_RE.matcher(key).matches()) {
            writeJson(response, 400, Map.of("error", "invalid-idempotency-key"));
            return;
        }
        byte[] body;
        try {
            body = readLimited(request.getInputStream(), MAX_BODY_BYTES + 1);
        } catch (IOException | RuntimeException e) {
            writeJson(response, 500, Map.of("error", "idempotency-body-read-failed"));
            return;
        }
        if (body.length > MAX_BODY_BYTES) {
            // 请求太大——不读进来、不缓存、不放行：拒绝而非「放行一个可能被截断的请求」
            writeJson(response, 413, Map.of("error", "idempotency-body-too-large"));
            return;
        }
        String fingerprint = sha256Hex(body);
        long now = System.currentTimeMillis();
        Optional<StoredResponse> hit = Optional.empty();
        try {
            hit = store().find(key, now);
        } catch (RuntimeException e) {
            LOG.warn("idempotency lookup threw (fail-open): {}", e.getClass().getSimpleName());
        }
        if (hit.isPresent()) {
            StoredResponse row = hit.get();
            if (row.fingerprint().equals(fingerprint)) {
                response.setStatus(row.status());
                response.setHeader(REPLAY_HEADER, "true");
                response.setContentType(CT);
                response.getOutputStream().write(row.body().getBytes(StandardCharsets.UTF_8));
                return;
            }
            writeJson(response, 409, Map.of("error", "idempotency-key-conflict"));
            return;
        }
        ByteArrayHttpServletRequestWrapper cachedReq = new ByteArrayHttpServletRequestWrapper(request, body);
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        chain.doFilter(cachedReq, wrapped);
        byte[] respBytes = wrapped.getContentAsByteArray();
        int status = wrapped.getStatus();
        if (status >= 200 && status < 300 && respBytes.length > 0) {
            try {
                store().save(key, new StoredResponse(
                        fingerprint, status, new String(respBytes, StandardCharsets.UTF_8), now, ttlMs));
            } catch (RuntimeException e) {
                LOG.warn("idempotency save threw (fail-open): {}", e.getClass().getSimpleName());
            }
        }
        response.setHeader(REPLAY_HEADER, "false");
        wrapped.copyBodyToResponse();
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(digest.digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /** 只读这么多字节；超出即停（调用方据此判定 413） */
    private static byte[] readLimited(java.io.InputStream in, int limit) throws IOException {
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream(Math.min(limit, 8192));
        byte[] chunk = new byte[8192];
        int remaining = limit;
        while (remaining > 0) {
            int read = in.read(chunk, 0, Math.min(chunk.length, remaining));
            if (read < 0) {
                break;
            }
            buf.write(chunk, 0, read);
            remaining -= read;
        }
        return buf.toByteArray();
    }

    private void writeJson(HttpServletResponse response, int status, Map<String, String> payload)
            throws IOException {
        String json = MAPPER.writeValueAsString(payload);
        response.setStatus(status);
        response.setHeader(REPLAY_HEADER, "false");
        response.setContentType(CT);
        response.getOutputStream().write(json.getBytes(StandardCharsets.UTF_8));
    }

    /** 让下游仍可重复读取 body */
    private static final class ByteArrayHttpServletRequestWrapper extends HttpServletRequestWrapper {
        private final byte[] body;

        ByteArrayHttpServletRequestWrapper(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream in = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public boolean isFinished() {
                    return in.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    // 同步读取，不支持异步
                }

                @Override
                public int read() {
                    return in.read();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
