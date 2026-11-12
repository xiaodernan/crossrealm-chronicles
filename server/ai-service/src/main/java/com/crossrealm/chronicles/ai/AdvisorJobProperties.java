package com.crossrealm.chronicles.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * W-Y4：可靠任务队列的旋钮，独立成 {@code ai-service.jobs.*} 而不是塞进 {@link AiProperties}。
 *
 * <p>理由：{@code AiProperties} 描述的是**一次上游调用**的语义（模型 / 超时 / 缓存 / 熔断），
 * 这一份描述的是**一个进程里排队**的语义（容量 / 并发 / 重试 / 保留量）。它们的调参场景
 * 完全不同：改模型的人不该顺手把队列容量也改了。
 */
@ConfigurationProperties("ai-service.jobs")
public class AdvisorJobProperties {

    /** 有界队列容量。满则明确 429，不静默丢、更不让请求线程去等一个空位。 */
    private int capacity = 64;

    /**
     * 消费者线程数。刻意远小于 Tomcat 最大线程数：上游是**慢速且按次计费**的资源，
     * 开 200 个 worker 不会让模型变快，只会把限流提前打出来。2 是"能并行、又不惊群"的档。
     */
    private int workers = 2;

    /** 单个任务最多尝试几次（含第一次）。 */
    private int maxAttempts = 3;

    /** 指数退避基数；实际等待 = base &lt;&lt; (attempt-1)，上限 4 位移。 */
    private long retryBaseMs = 200;

    /** 给客户端的建议轮询间隔，纯提示，不是协议承诺。 */
    private long pollAfterMs = 500;

    /**
     * 终态任务的最大保留数。任务结果必须能被轮询到，但没人轮询的任务不能永远占着堆：
     * 超限时按完成时间淘汰最老的 DONE/DEAD，**绝不动 QUEUED/RUNNING**（那是还在飞的答案）。
     */
    private int maxTracked = 512;

    /**
     * W-Z1：任务队列后端。**默认 in-memory**（零额外基础设施，W-Y4 的进程内队列）；
     * 配 {@code redis} 且 Spring 注入了 {@code StringRedisTemplate} 时，切换到
     * Redis Streams 消费者组（跨实例可靠投递：崩溃的任务由其它实例 pending 重投）。
     */
    private String backend = "in-memory";

    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }

    public int getWorkers() { return workers; }
    public void setWorkers(int workers) { this.workers = workers; }

    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

    public long getRetryBaseMs() { return retryBaseMs; }
    public void setRetryBaseMs(long retryBaseMs) { this.retryBaseMs = retryBaseMs; }

    public long getPollAfterMs() { return pollAfterMs; }
    public void setPollAfterMs(long pollAfterMs) { this.pollAfterMs = pollAfterMs; }

    public int getMaxTracked() { return maxTracked; }
    public void setMaxTracked(int maxTracked) { this.maxTracked = maxTracked; }

    public String getBackend() { return backend; }
    public void setBackend(String backend) { this.backend = backend; }
}
