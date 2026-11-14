package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.ai.AiServiceClient;
import com.crossrealm.chronicles.game.cache.TtlCache;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardService;
import com.crossrealm.chronicles.game.leaderboard.LeaderboardRedisMirror;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import com.crossrealm.chronicles.game.trial.TrialRedisMirror;
import com.crossrealm.chronicles.game.season.SeasonClient;
import com.crossrealm.chronicles.game.season.SeasonSnapshot;
import com.crossrealm.chronicles.game.telemetry.TelemetryService;
import com.crossrealm.chronicles.game.trial.TrialLeaderboardService;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-X13：/api/ops/health —— 复合健康视图（服务端 + 配置 + 缓存大小）
 *
 * 用途：
 * - 面板常态不打它；
 * - 运维点通 `curl /api/ops/health` 时，它能答出
 *   "这个实例用了哪份 config（seed + version note + maxLimit）、谁注册进了它身边的缓存、
 *    leaderboard 有多少事件落在内存" —— 全是无外呼的只读字段，不会打挂自己。
 *
 * 与 `/actuator/health` 的分工：acuter 只是 liveness；这一路是 readiness-ish 的**配置快照**。
 *
 * W-X14 追加 `/api/ops/season`：把下游 season-service 的当前赛季**聚合**到同一个运维面。
 * 这是这一片唯一一处外呼 —— 所以它**单独一格**，不和 `/api/ops/health` 混在一起：
 * 健康视图必须永远零依赖、读即快；而"下游现在回答什么"天然可能慢或失败。
 * W-Z8 切片1 追加 `/api/ops/advisor`：同一纪律的第二处外呼（Feign → ai-service 只读派生），
 * 同样单独一格；`/api/ops/stats` 聚合自身内存数据，保持零外呼不变。
 * W-Z8 切片3 追加 `/api/ops/dead-letter`：死信只读白名单的再中转一格 + 一眼可读的 reason 直方图。
 * W-Z13 追加 `/api/ops/redis`：Redis 背板镜像的只读诊断（后端标志 / mirror 是否挂上 / ZCARD）。
 */
@RestController
public class OpsController {

    private final GameServiceProperties properties;
    private final LeaderboardService leaderboardService;
    private final TrialLeaderboardService trialService;
    private final TelemetryService telemetryService;
    private final SeasonClient seasonClient;
    private final AiServiceClient aiServiceClient;
    private final RequestCountFilter requestCountFilter;
    private final String applicationName;

    private final TtlCache seasonCache;
    /** 换季广播接收器（W-M5）——仅 spring.cache.type=redis 时存在；不存在则 health 报告 -1（不编造） */
    private final SeasonBroadcastListener seasonBroadcastListener;
    /** Redis 排行榜镜像（W-Y5；backend=redis 时装配，Cassandra 口径默认不出现） */
    private final LeaderboardRedisMirror leaderboardMirror;
    /** Redis 试炼榜镜像（W-Y6 切片3；backend=redis 时装配） */
    private final TrialRedisMirror trialMirror;
    /** W-Z59：暂存发布计数出口（bean 永远存在；@Nullable 之于对称构造风格） */
    private final NotifyMirrorService notifyMirror;

    /** @Autowired: 与 W-X13 起的契约一致 — 单一构造供 Spring 注入（W-P14 起八参起；W-Z8 起九参） */
    @org.springframework.beans.factory.annotation.Autowired
    public OpsController(
            GameServiceProperties properties,
            LeaderboardService leaderboardService,
            TrialLeaderboardService trialService,
            TelemetryService telemetryService,
            SeasonClient seasonClient,
            AiServiceClient aiServiceClient,
            RequestCountFilter requestCountFilter,
            TtlCache seasonCache,
            // 可选依赖要写 @Nullable，不能写 @Autowired(required=false)：后者放在**构造器参数**上
            // 不生效（单构造器的依赖解析是原子的），没有 listener bean 时 Spring 会直接启动失败。
            @org.springframework.lang.Nullable SeasonBroadcastListener seasonBroadcastListener,
            @Value("${spring.application.name:game-service}") String applicationName,
            // 可选镜像：backend=redis 时 bean 才会注册；写 @Nullable 不写 required=false，与上面同口径
            @org.springframework.lang.Nullable LeaderboardRedisMirror leaderboardMirror,
            @org.springframework.lang.Nullable TrialRedisMirror trialMirror,
            @org.springframework.lang.Nullable NotifyMirrorService notifyMirror) {
        this.properties = properties;
        this.leaderboardService = leaderboardService;
        this.trialService = trialService;
        this.telemetryService = telemetryService;
        this.seasonClient = seasonClient;
        this.aiServiceClient = aiServiceClient;
        this.requestCountFilter = requestCountFilter;
        this.seasonCache = seasonCache;
        this.seasonBroadcastListener = seasonBroadcastListener;
        this.applicationName = applicationName;
        this.leaderboardMirror = leaderboardMirror;
        this.trialMirror = trialMirror;
        this.notifyMirror = notifyMirror;
    }

    /** Controller 构造时刻 ≈ 应用启动时刻（容器装配完才创建），足够当 uptime 的起点 */
    private final java.time.Instant startedAt = java.time.Instant.now();

    private long seasonBroadcastReceived() {
        return seasonBroadcastListener != null ? seasonBroadcastListener.receivedCount() : -1L;
    }

    /**
     * W-Z59：报讯镜像的本进程发布成功账本。镜像 bean 没装配时不标部分成功，
     * 而是如实回 {available:false}（与 seasonBroadcastReceived=-1 同一意图：
     * 运维看一眼就知道「这条流根本没装」，而不是「装了但一次没走」）。
     */
    private Map<String, Object> notifyMirrors() {
        if (notifyMirror == null) {
            return Map.of("available", false);
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("available", true);
        stats.put("published", notifyMirror.mirrorStats());
        return stats;
    }

    @GetMapping("/api/ops/health")
    public Map<String, Object> health(
            @org.springframework.web.bind.annotation.RequestHeader(value = "X-Request-Id", required = false)
            String requestId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", applicationName);
        result.put("version", "0.1.0-SNAPSHOT");
        result.put("javaVersion", System.getProperty("java.version"));
        // W-X18：网关注入的 X-Request-Id 原样回显——curl 带了 id 整条链就只有一个名字；
        // 没带就给 null（不编造：空就是空，运维一眼看见这扇门有没有被贴上名字）。
        result.put("requestId", requestId);
        // W-X17：可用性面的两格 uptime —— 重启过没、活了多久，运维一眼分得清"实例刚起"和"成熟实例"
        result.put("startedAt", startedAt.toString());
        result.put("uptimeSec", java.time.Duration.between(startedAt, java.time.Instant.now()).getSeconds());
        result.put("config", Map.of(
                "leaderboardMaxLimit", properties.getLeaderboard().getMaxLimit(),
                "seedDemoData", properties.getLeaderboard().isSeedDemoData(),
                "telemetryMaxEvents", properties.getTelemetry().getMaxEvents(),
                "versionNote", properties.getVersionNote()));
        result.put("inMemory", Map.of(
                "leaderboardRecords", leaderboardService.size(),
                "trialRecords", trialService.size(),
                "telemetryEvents", telemetryService.count(),
                "leaderboardCache", leaderboardService.cacheStats(),
                "trialCache", trialService.cacheStats(),
                "seasonCache", seasonCache.stats()));
        // W-M5：广播接收计数（没有监听器就返 -1 —— “不适用”，不编造）
        result.put("seasonBroadcastReceived", seasonBroadcastReceived());
        // W-Z59：报讯镜像本进程的发布成功计数（boss/season/trial/leaderboard/total）
        result.put("notifyMirrors", notifyMirrors());
        return result;
    }

    /**
     * 下游 season-service 的当前赛季（W-X14；W-P4 起走 30s TTL 缓存）。
     *
     * 两层保底：
     * 1. Feign 的 `fallbackFactory` 在熔断/连不上时返回 `unavailable()`；
     * 2. 这里再包一层 try/catch —— 万一熔断没开（配置被改掉）导致异常直抛，
     *    运维视图仍然回答 `available: false`，而不是 500。
     *
     * 两层的顺序不能反：先靠契约降级，再靠本地兜底。只有第二层的话，
     * 每次失败都要等 Feign 抛完才知道，而 Feign 的异常里没有"这一季是什么"。
     *
     * 缓存策略（W-P4）：loader 抛的异常不存；一次成功过的"不可用"也存——TTL 30s 自恢复；
     * 这保证 5xx 时 ops 页面的轮询不打死下游，而不是每次请求都重新闯一遍熔断。
     * 30 秒的陈旧度对"现在是什么赛季"是可接受的（赛季每天都在跑）。
     */
    @GetMapping("/api/ops/season")
    public Map<String, Object> season() {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            SeasonSnapshot snapshot = seasonCache.get(
                    "season.active",
                    () -> seasonClient.active(),
                    Duration.ofSeconds(30));
            result.put("available", snapshot.available());
            if (snapshot.available()) {
                result.put("id", snapshot.id());
                result.put("name", snapshot.name());
                result.put("tagline", snapshot.tagline());
                result.put("modifierIds", snapshot.modifierIds());
                result.put("soulsBonusPct", snapshot.soulsBonusPct());
                result.put("dayInCycle", snapshot.dayInCycle());
                result.put("daysRemaining", snapshot.daysRemaining());
            }
        } catch (RuntimeException error) {
            result.put("available", false);
            result.put("reason", error.getClass().getSimpleName());
        }
        return result;
    }

    /**
     * ai-service 只读派生（W-Z8 切片1）：/api/ops/advisor
     *
     * 两条腿（与 /api/ops/season 同一口径，外加一条自己的腿）：
     * 1. Feign 的 `fallbackFactory` 在熔断 / 连不上时返回**空 Map** —— 这一路据此回答
     *    `available: false`，而不是抛 500 也不是拿到一个失真的对象；
     * 2. 本地再包一层 try/catch —— 万一熔断没开（配置被改掉）导致异常直抛，仍然回答
     *    `available: false` + `reason`，两条腿的顺序不能反（先靠契约降级，再靠本地兜底）。
     *
     * 为什么不进 /api/ops/stats：stats 聚合的是这一个实例的内存数据，零外呼、读即快；
     * advisor 是 Feign 外呼（最长 800/1200ms、30s 缓存），混进 stats 就等于让 stats
     * 继承外呼的所有失败模式 —— season 没有这么干，advisor 也不。
     * 
     * 30s TTL 的两格独立缓存：`advisor.health` / `advisor.jobs` 分别失效、分别降级 ——
     * health 挂了 jobs 仍可能是好的（两个端点是两条独立的 HTTP 路径，熔断按方法粒度记录）。
     * 空 Map = 没答上（fallback 或下游静默地给了个空体）——任何真实 ai-service 都不会给空 Map。
     */
    @GetMapping("/api/ops/advisor")
    public Map<String, Object> advisor() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("health", cachedAdvisorPart("advisor.health", aiServiceClient::health));
        result.put("jobs", cachedAdvisorPart("advisor.jobs", aiServiceClient::jobsStats));
        return result;
    }

    private Map<String, Object> cachedAdvisorPart(String key, Supplier<Map<String, Object>> loader) {
        try {
            Map<String, Object> body = seasonCache.get(key, loader, Duration.ofSeconds(30));
            if (body == null || body.isEmpty()) {
                return unavailableAdvisorPart();
            }
            Map<String, Object> part = new LinkedHashMap<>(body);
            part.put("available", true);
            return part;
        } catch (RuntimeException error) {
            Map<String, Object> part = new LinkedHashMap<>();
            part.put("available", false);
            part.put("reason", error.getClass().getSimpleName());
            return part;
        }
    }

    /**
     * 死信只读白名单的中转一格（W-Z8 切片3）：Feign → ai-service `/jobs/dead-letter?limit=20`
     * → 直方图一眼看懂「哪一类失败在反复出现」（如 not-configured ×7 / upstream-500 ×2）。
     * items 本身就是白名单产物（无 question/answer），这里不再做二次过滤；
     * 直方图只读 reason 字段，缺失/空一律归 unknown。
     */
    @GetMapping("/api/ops/dead-letter")
    public Map<String, Object> deadLetter() {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            Map<String, Object> body = seasonCache.get(
                    "advisor.deadletter", aiServiceClient::deadLetter, Duration.ofSeconds(30));
            if (body == null || body.isEmpty()) {
                return unavailableAdvisorPart();
            }
            Map<String, Object> part = new LinkedHashMap<>(body);
            part.put("available", true);
            Map<String, Long> histogram = new LinkedHashMap<>();
            Object itemsObj = body.get("items");
            if (itemsObj instanceof List<?> items) {
                for (Object o : items) {
                    if (o instanceof Map<?, ?> m) {
                        Object r = m.get("reason");
                        String reason = r == null ? "unknown" : String.valueOf(r).trim();
                        if (reason.isEmpty()) reason = "unknown";
                        histogram.merge(reason, 1L, Long::sum);
                    }
                }
            }
            part.put("reasons", histogram);
            return part;
        } catch (RuntimeException error) {
            Map<String, Object> part = new LinkedHashMap<>();
            part.put("available", false);
            part.put("reason", error.getClass().getSimpleName());
            return part;
        }
    }

    private Map<String, Object> unavailableAdvisorPart() {
        Map<String, Object> part = new LinkedHashMap<>();
        part.put("available", false);
        part.put("reason", "fallback");
        return part;
    }

    /**
     * 跨域聚合统计（W-P12）：/api/ops/stats
     *
     * 把 leaderboard / trial / telemetry 三块内存数据聚合一眼能读完。
     * 零外呼、零缓存（总量 O(n)，n = 三块各自小到可以遍历），全量快照式读取。
     */
    /**
     * Redis 背板诊断（W-Z13）：/api/ops/redis
     *
     * 只读视图——报告两个 Redis 镜像的存在形态与条数（不是业务智能）：
     *   backend 标志（memory=默认 null 镜像 / redis=装配镜像，启动恢复过）
     *   mirror 是否注册、mirrorEntries（ZCARD，出错回 -1；名字计数不含玩家内容）
     *   seedDemoData / maxLimit 配置便于对凭证对齐本机验证值
     */
    @GetMapping("/api/ops/redis")
    public Map<String, Object> redis() {
        Map<String, Object> leaderboard = new LinkedHashMap<>();
        leaderboard.put("backend", properties.getLeaderboard().getBackend());
        leaderboard.put("seedDemoData", properties.getLeaderboard().isSeedDemoData());
        leaderboard.put("maxLimit", properties.getLeaderboard().getMaxLimit());
        leaderboard.put("mirror", leaderboardMirror != null);
        leaderboard.put("mirrorEntries", leaderboardMirror != null ? leaderboardMirror.zcard() : -1);

        Map<String, Object> trials = new LinkedHashMap<>();
        trials.put("backend", properties.getTrial().getBackend());
        trials.put("seedDemoData", properties.getTrial().isSeedDemoData());
        trials.put("maxLimit", properties.getTrial().getMaxLimit());
        trials.put("mirror", trialMirror != null);
        trials.put("mirrorEntries", trialMirror != null ? trialMirror.zcard() : -1);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("leaderboard", leaderboard);
        result.put("trials", trials);
        result.put("note", "mirrorEntries=-1 的含义：memory 后端（mirror 非注册）或 ZCARD 失败；不是数据损坏");
        return result;
    }

    @GetMapping("/api/ops/stats")
    public Map<String, Object> stats() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("since", startedAt.toString());

        /* --- leaderboard --- */
        result.put("leaderboard", leaderboardService.stats());

        /* --- trials --- */
        result.put("trials", trialService.stats());

        /* --- telemetry --- */
        result.put("telemetry", telemetryService.summarize(5));

        /* --- telemetry 队列背压（W-M1：capacity / depth / enqueued / dropped / processed） --- */
        result.put("telemetryQueue", new LinkedHashMap<>(telemetryService.queueStats()));

        /* --- 请求计数（W-P14：本实例从启动到现在吃了多少业务流量） --- */
        Map<String, Object> req = new LinkedHashMap<>();
        req.putAll(requestCountFilter.counters());
        req.put("note", "actuator 与 /api/ops 不计入（运维/探活不是业务流量）");
        result.put("requests", req);

        return result;
    }
}
