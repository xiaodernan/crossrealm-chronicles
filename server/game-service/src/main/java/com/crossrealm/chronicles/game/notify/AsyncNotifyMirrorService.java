package com.crossrealm.chronicles.game.notify;

import java.util.List;

/**
 * 报讯镜像·异步派发（W-Z79，2026-11-14 压力测试死锁/卡顿修复）。
 *
 * <p>别看这几行像在搬数据：这个类把「易主 / 换季 / 双冠」几条报讯的 Feign 外呼
 * 全部**脱离请求线程**。同步版的情况是：本机 loopback 对未监听端口的 TCP RST 需要
 * 2~4 秒才返回（见 docs/ONLINE_SERVICES.md 已知坑一），而 notification-service
 * 没在跑时，每条易主报讯都要在请求线程上烧那一点时间——W-Z79 的 40 并发写入
 * 测到 p50=3000ms，根源就在这里。
 *
 * <p>纪律：**fire-and-forget**。队列满即丢弃 oldest-then-new（报讯里没有什么
 * 比「不拖路由主路径」更重要）；consumer 出异常一律吞；daemon 线程——不阻碍 JVM 退出。
 * 单测**直接用 {@link NotifyMirrorService}** 或直调本类的父类方法，行为确定性不受此类影响。
 */
public class AsyncNotifyMirrorService extends NotifyMirrorService {

    /** 有界队列：满了丢弃最旧一条（报讯是「最近发生了什么」——旧新闻先去） */
    private final java.util.concurrent.LinkedBlockingQueue<Runnable> queue =
            new java.util.concurrent.LinkedBlockingQueue<>(256);
    private final Thread worker;
    private final java.util.concurrent.atomic.AtomicLong dropped = new java.util.concurrent.atomic.AtomicLong();

    public AsyncNotifyMirrorService(NotifyClient client, boolean enabled) {
        super(client, enabled);
        worker = new Thread(this::drain, "notify-mirror-dispatch");
        worker.setDaemon(true);
        worker.start();
    }

    /** 队列里积压的未投递条数（只读、给 /api/ops 观测用） */
    public java.util.Map<String, Object> dispatchStats() {
        java.util.Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("queued", queue.size());
        stats.put("dropped", dropped.get());
        return stats;
    }

    private void offer(Runnable r) {
        if (!queue.offer(r)) {
            queue.poll();              // 丢最旧一条，留住正在发生的那个
            dropped.incrementAndGet();
            queue.offer(r);
        }
    }

    private void drain() {
        for (;;) {
            final Runnable job;
            try {
                job = queue.take();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            try {
                job.run();
            } catch (RuntimeException ignored) {
                // 报讯是 best-effort 的——单条派发炸不掉整条流（同一纪律见父类 mirror 方法）
            }
        }
    }

    @Override
    public boolean mirror(String type, String detail) {
        final String t = type, d = detail;
        offer(() -> super.mirror(t, d));
        return true;
    }

    @Override
    public boolean mirrorLeaderboardDethrone(String runner, String bossId, long clearTimeMs) {
        final String r = runner, b = bossId;
        final long ms = clearTimeMs;
        offer(() -> super.mirrorLeaderboardDethrone(r, b, ms));
        return true;
    }

    @Override
    public boolean mirrorTrialDethrone(String runner, String seasonId, int score, int layersCleared) {
        final String r = runner, s = seasonId;
        final int sc = score, lc = layersCleared;
        offer(() -> super.mirrorTrialDethrone(r, s, sc, lc));
        return true;
    }

    @Override
    public boolean mirrorSeasonAdvance(String seasonId) {
        final String s = seasonId;
        offer(() -> super.mirrorSeasonAdvance(s));
        return true;
    }

    @Override
    public boolean mirrorDualCrown(String runner, List<String> crownedSeasons) {
        final String r = runner;
        final List<String> copy = crownedSeasons == null ? List.of() : List.copyOf(crownedSeasons);
        offer(() -> super.mirrorDualCrown(r, copy));
        return true;
    }
}
