package com.crossrealm.chronicles.game;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 请求计数器（W-P14）——game-service 的总流量体征。
 *
 * <p>运维面此前只能答出"实例活着没"（health）与"榜/遥测内部长什么样"（stats），
 * 答不出"这个实例从启动到现在一共吃了多少请求、漏了多少 4xx/5xx"。
 * 网关有限流计数（W-P13），但网关不知道下游具体看见了什么——这一格补上。
 *
 * <p>**口径**：
 * <ul>
 *   <li>排除 {@code /actuator} 与 {@code /api/ops}——探活与运维轮询不算业务流量，
 *       否则 smoke / compose verify 会把计数器刷满，毫无意义；</li>
 *   <li>计数发生在 {@code chain.doFilter} 之后（响应已提交），读 {@code res.getStatus()}；</li>
 *   <li>只记累计数（total / 4xx / 5xx），不记路径、不记 IP——计数器不是访问日志。</li>
 * </ul>
 */
@Component
public class RequestCountFilter extends OncePerRequestFilter {

    private final AtomicLong total = new AtomicLong();
    private final AtomicLong rejected4xx = new AtomicLong();
    private final AtomicLong serverError5xx = new AtomicLong();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean countable = path != null && !path.startsWith("/actuator") && !path.startsWith("/api/ops");
        try {
            chain.doFilter(request, response);
        } finally {
            if (countable) {
                total.incrementAndGet();
                int status = response.getStatus();
                if (status >= 400 && status < 500) {
                    rejected4xx.incrementAndGet();
                } else if (status >= 500) {
                    serverError5xx.incrementAndGet();
                }
            }
        }
    }

    /** 快照（只读拷贝；给 /api/ops/stats 与测试用） */
    public Map<String, Long> counters() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("total", total.get());
        m.put("rejected4xx", rejected4xx.get());
        m.put("serverError5xx", serverError5xx.get());
        return m;
    }
}
