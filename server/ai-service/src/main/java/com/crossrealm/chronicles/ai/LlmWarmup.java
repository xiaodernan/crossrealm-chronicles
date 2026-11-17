package com.crossrealm.chronicles.ai;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * W-Z345「启动热身」（Codex 同型行为）：上游 prompt-cache 按 cache-key + 冻结前缀铺页，
 * 新进程的头两个请求注定冷——不铺就等第一个玩家自己付这笔 token。
 *
 * <p>流程：应用就绪 → 异步（daemon 线程，不阻塞启动）放出 {@link LlmClient#warmupUpstream()}，
 * 逐 lane 发一小个 "warmup" 请求，把每条 lane 的前缀页都铺暖，然后把结果只打进日志。
 *
 * <p>开关：{@code llm.warmup-on-boot}（env 变量 {@code LLM_WARMUP_ON_BOOT}，默认 true）。
 * CI/沙箱显式传 false（行为等价于「没 Key」）；未配置 API Key 时 LlmClient 自动跳过，不发任何请求。
 * 完成前容器已可接流量——冷却期只影响头几条上游请求的首包缓存命中率。
 */
@Component
public class LlmWarmup {

    private static final Logger LOG = LoggerFactory.getLogger(LlmWarmup.class);

    /** 守护线程池：不在应用主循环里抢 executor */
    private static final Executor WARMUP_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "llm-warmup");
        t.setDaemon(true);
        return t;
    });

    private final LlmClient client;
    private final boolean enabled;

    public LlmWarmup(LlmClient client,
            @Value("${llm.warmup-on-boot:true}") boolean enabled) {
        this.client = client;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!enabled) {
            LOG.info("llm.warmup.skip (llm.warmup-on-boot=false)");
            return;
        }
        long t0 = System.currentTimeMillis();
        CompletableFuture.runAsync(() -> {
            try {
                LOG.info("llm.warmup.begin");
                client.warmupUpstream();
                LOG.info("llm.warmup.end ({}ms)", System.currentTimeMillis() - t0);
            } catch (Throwable e) {
                LOG.info("llm.warmup.error ({}: {})", e.getClass().getSimpleName(),
                        String.valueOf(e.getMessage()).substring(0, Math.min(120, String.valueOf(e.getMessage()).length())));
            }
        }, WARMUP_EXECUTOR).orTimeout(60, TimeUnit.SECONDS);
    }
}
