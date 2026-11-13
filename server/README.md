# Crossrealm Chronicles :: Server —— 在线伙伴服务（可选）

《Crossrealm Chronicles》本体是**纯前端**的 Three.js 游戏，离线可玩、无任何运行时依赖。
本目录是一个**独立的、可选的** Spring Cloud 微服务后端（Java 17+ / Maven 3.9+），为联机场景提供：

| 能力 | 实现 | 端口（本地默认） |
|---|---|---|
| 服务发现 / 注册中心 | Spring Cloud Netflix Eureka（`discovery-server`） | 8761 |
| 统一配置中心 | Spring Cloud Config（`config-server`，native profile 内置 classpath 配置仓库） | 8888 |
| API 网关 | Spring Cloud Gateway 4.3（reactive），按服务名 `lb://` 负载均衡转发 | 8080 |
| 在线伙伴业务 API | `game-service`：排行榜 / 遥测事件 / 版本号（纯内存实现、零数据库） | 8081 |
| 赛季服务（W-X14） | `season-service`：赛季主题 / 词缀 / 周期倒计时（按 epochDay 算，不存状态） | 8082 |
| AI 顾问（W-Y1） | `ai-service`：星轨顾问（服务端独占密钥 / 选择性重试 / 熔断 / TTL 缓存） | 8083 |
| 可靠任务队列（W-Y4） | `ai-service`：`/api/ai/chat/async` 提交 → `/api/ai/jobs/{id}` 轮询；有界队列 / 2 worker / 幂等键 / 选择性重试 / 死信 / 背压 429 | 8083 |

> 与游戏本体**完全解耦**：`npm run build` 不感知它；不接它时游戏功能不受任何影响。

## 模块

```
server/
  pom.xml                # 父 POM（Boot 3.5.16 + Spring Cloud 2025.0.3 BOM）
  discovery-server/      # Eureka 注册中心（+ Dockerfile）
  config-server/         # Spring Cloud Config Server（classpath:/config 仓库，+ Dockerfile）
  game-service/          # REST API（排行榜 / 遥测 / 版本 / 运维视图），OpenFeign 调 season-service
  season-service/        # 赛季主题与词缀（周期轮转 + 配置中心 override），独立单测（+ Dockerfile）
  ai-service/            # 星轨顾问：唯一持有 LLM_API_KEY 的进程（+ Dockerfile / system-prompt.txt）
  gateway/               # Spring Cloud Gateway（/api/** → game-service，/api/seasons/** → season-service，/api/ai/** → ai-service）
  env.example            # 环境变量样例（**不含真值**）：复制成 server/.env 后填 LLM_API_KEY
  scripts/smoke.ps1      # 冒烟脚本：六个实例真起真打（含 4j AI 健康 / 4k 异步队列契约），跑完自动关闭
   scripts/verify-breaker.ps1 # W-X5 网关熔断验证（手动诊断）：200 → 503 → 自愈 200
  scripts/verify-redis-rate-limit.ps1 # W-P10 Redis 限流背板实证（throwaway redis + 70 条 burst；第 61 条 429；停 redis 看 fail-open；CI 每次 server 变更真跑）
  scripts/verify-redis-season-cache.ps1 # W-S2 Redis 赛季缓存实证（cache.type=redis：两次返回相同、键存在、TTL~300s、停 redis 报错、起 redis 恢复；CI 真跑）
  scripts/verify-redis-advisor-queue.ps1 # W-Z1 Redis 顾问队列实证（jobs.backend=redis：提交→DEAD（无 LLM 密钥确定）→DLQ→死信白名单不回显玩家提问；CI 真跑）
  scripts/verify-redis-leaderboard.ps1 # W-Y5 Redis 排行榜镜像实证（backend=redis：三条提交→ZCARD=3→停 A→重启 B→Top-K 完整恢复；CI 真跑）
  scripts/verify-redis-trial.ps1 # W-Y6 切片3 Redis 试炼榜镜像实证（与排行榜同一形态；重启后赛季过滤与 score 降序完整恢复；CI 真跑）
  scripts/verify-prometheus.ps1 # W-Z10 Prometheus 端点实证（Micrometer metrics + JVM 基础指标；scrape 到 game_telemetry_* + jvm_memory_used_bytes）
  scripts/verify-prometheus-ai.ps1 # W-Z12 ai-service Prometheus 端点实证（advisor chat 一次真对话 + scrape /actuator/prometheus 看到 ai_upstream_calls_total / prompt_tokens_total / cache_hit_ratio）
  docker-compose.yml     # 六容器一键部署 + 一次性 verify 容器（见下文「用 Docker 部署」）
```

## 快速开始

```bash
cd server
mvn -B verify                       # 编译 + 跑全部 9 项单测
java -jar discovery-server/target/discovery-server-0.1.0-SNAPSHOT.jar   # :8761
java -jar config-server/target/config-server-0.1.0-SNAPSHOT.jar          # :8888
java -jar game-service/target/game-service-0.1.0-SNAPSHOT.jar            # :8081
java -jar season-service/target/season-service-0.1.0-SNAPSHOT.jar        # :8082
java -jar ai-service/target/ai-service-0.1.0-SNAPSHOT.jar                # :8083（LLM_API_KEY 不设则返回 503，游戏不受影响）
java -jar gateway/target/gateway-0.1.0-SNAPSHOT.jar                      # :8080
```

然后访问 `http://localhost:8080/api/leaderboard`，或看这一轮的赛季：`http://localhost:8080/api/seasons/active`。

一键验证（推荐）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

冒烟脚本把五个实例都拉起来，逐一验证
配置下发 → 服务注册 → 网关转发 → 遥测计数的完整链路，
默认使用 **28xxx** 端口段且先确认端口空闲（避免与开发机上同机其它 Spring Cloud 项目抢端口），
结束时自动关闭它拉起的进程，日志落在临时目录的 `crossrealm-server-smoke\` 子目录。
（本仓库 CI（`.github/workflows/server.yml`）也跑这一步——ubuntu runner 上每次推送都会真起真打全链路。）

网关带 **W-X5 熔断**（`spring-cloud-circuitbreaker-reactor-resilience4j`，语义与边界见下）；**W-X11 Retry 滤镜**：`GET /api/version` 幂等路径专用路由（`game-service-version`, order=-1）带 backoff retry（≤ 2 次、50→200ms，502/503 only），`POST` 绝不重试。 
game-service 路由上 `CircuitBreaker` 滤镜（滑动窗口 10 / 最少 5 次 / 50% 失败率 / 开闸 5 秒 / 半开 3 个请求），
路由链抛异常时快速走 `forward:/fallback/503` → `FallbackController` 返回
`503 + upstream-unavailable`（不是空响应、不是上游错误页）。
注意一个诚实边界：**负载均衡无实例时**（eureka 缓存刷新前可见零实例），
Spring Cloud LoadBalancer 直接 short-circuit 出空 503、不经过异常路径，熔断器不介入——
两条路径都返回 503，只有 body 形态不同。诊断脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-breaker.ps1
```

（29xxx 端口段；验证：baseline 200 → 停掉 game-service 后连打 503 → 重新拉起后自动恢复 200）

配置中心支持 
**W-X13 深度健康视图**（`OpsController`，无外呼）：`GET /api/ops/health` —— 一次调用答出：service name / version / javaVersion / 当前 bind 的 `game-service.*` 配置（seed / max events / version note）以及 `inMemory.*`（leaderboard 记录数 / telemetry 事件数）。互补 /acactuator/health 只判 liveness、不出别的信息。
**W-X12 限流（rate-limit by IP）**：网关新增 `RateLimitByIpFilter`（Spring Cloud Gateway `GlobalFilter`，order=-100，独立于 circuitbreaker / retry）—— `X-Forwarded-For`（信任代理后）或连接 `remoteAddress`（fallback）为 key，同 IP 10 秒最多 60 次，超出返回 `429 + {"error":"rate-limited","retryAfterMs":…}`。
- 正常玩家与 smoke 不会撞上（smoke 全链路 ~15 次）
- 60 req / 10s 足以挡住单 IP 高频抓取 / 刷榜
- 注意：号段攻击（一整网段一个 IP 换了来一批）会绕过——生产需要 Redis + 集群级 ratelimit；这里只把本地开发/单机网关的第一道闸补上：`game-service` 的 `GameServiceProperties` 挂 `@RefreshScope`，`/actuator/refresh` 端点已暴露（`application/json`，空 body 也要）。改写 `game-service.yml`（本地跑的是 classpath，想演练就把 smoke 临时 config 目录挂进 `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS`——**`file:` URI 必须统一正斜杠**），然后 `POST /actuator/refresh`：`/api/version` 的备注和排行榜 `maxLimit` —— 全不重启进程、当场生效。smoke.ps1 已内置这一步。

## 用 Docker 部署

每个模块一个 Dockerfile（打 `mvn verify` 产出的 `*.jar`，**构建期不下载依赖**，最适合离线/受限网络）：

```powershell
cd server
mvn -B verify                       # 先产出各模块 target/*.jar
docker compose build                 # 四个镜像，无需联网
docker compose up -d                 # 起栈（discovery → config → game-service → gateway，按健康检查顺序）
docker compose run --rm verify       # 一次性验证容器：version/leaderboard/telemetry/season/ops + seasons/stats + /api/ops/stats + /actuator/springcloud 八件套
docker compose down
```

> **实测状态**：本仓库开发机上 Docker 守护进程长期被另一个活跃项目占用，**本机未能完成镜像构建与起栈验证**；
> `docker compose config` 校验通过，Dockerfile 六行静态可验（wget 装进运行时镜像用于健康检查）。
> 真机验证口径以 `scripts/smoke.ps1` 为准（CI 每次推送跑）。容器网络里服务间用服务名互寻（`discovery`/`config`/`game-service`），
> 与单机 smoke 的 `localhost` 是两套世界，不要混。

## game-service API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/leaderboard?limit=10` | Boss 榜（按**用时升序**，启动时播种演示数据） |
| POST | `/api/leaderboard` | 提交通关记录 `{runner,bossId,clearTimeMs,chapter}` |
| GET | `/api/trials/leaderboard?season=&limit=10` | 位面试炼榜（按**分数降序**；`season` 缺省 = 跨季总榜） |
| POST | `/api/trials/runs` | 提交试炼成绩 `{runner,seasonId,score,layersCleared,secondsLeft}` |
| POST | `/api/telemetry/events` | 上报玩家事件 `{type,detail}`，限容缓存 |
| GET | `/api/telemetry/events/count` | 当前缓存事件数 |
| GET | `/api/telemetry/events` | 查看缓存事件（调试） |
| GET | `/api/telemetry/summary?topN=5` | 窗口频次摘要 `{windowSize,distinctTypes,byType:[{type,count}]}`（topN 夹到 [1,20]） |
| GET | `/api/version` | 服务版本（含配置中心下发的 `version-note`） |

配置经 `game-service` 的 `spring.config.import=optional:configserver:…` 从配置中心拉取：
`game-service.leaderboard.seed-demo-data` / `max-limit` / `game-service.trial.seed-demo-data` /
`max-limit` / `max-entries` / `telemetry.max-events` / `version-note`。
配置中心离线时回退到本地默认值，互不影响。

## AI 顾问与可靠任务队列（W-Y1 / W-Y2 / W-Y4）

浏览器**永远只认识网关**：`POST /api/ai/chat` 与 `POST /api/ai/chat/async`。上游地址、
`LLM_API_KEY`、Authorization 头全部只在 `ai-service` 进程内；配置中心里没有密钥，
health 与任何响应体都不回显它。游戏侧 W-Y2 的「星轨顾问」面板（F7）走
`OnlineServices.askAdvisor()`，断网/熔断/429 各自有玩家可读的一句话，不阻塞本地游戏。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/chat` | 同步一问一答 `{question,context?}` → `{answer,model,cached,latencyMs}` |
| POST | `/api/ai/chat/async` | 提交任务 `{question,context?,requestId?}` → `202 {jobId,status:queued,duplicate,pollAfterMs}`；队列满 → `429 + Retry-After` |
| GET | `/api/ai/jobs/{jobId}` | 轮询 `QUEUED/RUNNING/DONE/DEAD`；DONE 带答案，DEAD 带机器码原因；**不回显玩家输入** |
| GET | `/api/ai/jobs/stats` | 队列读数：capacity / depth / inFlight / rejected / dedupHits / retried / deadLettered |
| GET | `/api/ai/health` | configured / model / circuit / cache / upstreamCalls（白名单，无密钥） |
| POST | `/api/ai/echo-hint` | 回声灯一句暗示（与顾问共用缓存/熔断，人格提示不同） |

**为什么要队列**：一轮真实上游 2~30 秒，同步端点会把 Tomcat 工作线程钉在慢 I/O 上。
W-Y4 用有界队列 + 2 个 worker 做资源隔离：满则明确 429（不静默丢、不让请求线程等空位），
`requestId` 幂等（重连不会重复扣费），只对 `upstream-*` / `circuit-open` 做指数退避重试，
耗尽进可见的死信。默认旋钮在 `ai-service.jobs.*`（`AI_JOB_*` 环境变量可覆盖）。

**边界（别误读）**：这是**进程内**队列 —— 进程重启丢在途任务，多实例不共享 jobId。
跨实例可靠应换 Redis Streams（消费者组 + XACK + pending 重投），而不是给 HashMap 加分布式锁；
W-M5 的 Redis Pub/Sub 是 broadcast（掉线永久丢），两者互补。

真实上游联调（只有存在密钥时才跑，CI 默认零外呼、零花费）：

```bash
cd server
set -a; . ../.env; set +a
mvn -o -pl ai-service test -Dtest=AiLiveIntegrationTest,AdvisorJobLiveIntegrationTest
```

### 无头浏览器端到端（开发期，需真机 Chrome）

并轨侧留下的三份草稿已收编成正式工具，且做了两处安全化：**启动脚本里不再写死密钥**
（必须先导出 `LLM_API_KEY`，否则直接拒绝启动），也不再 `Stop-Process -Name java -Force`
（那会杀掉开发机上其它 Java 项目，改为端口预检 + 只回收自己起的 PID）。

```bash
set -a; . ./.env; set +a                   # 仓根 .env（gitignore）
powershell -ExecutionPolicy Bypass -File server/scripts/e2e-advisor-boot.ps1
npm run e2e:advisor                        # 无头 Chrome → F7 面板 → 真网关 → 真模型
```

**为什么不需要 `npm run build`**：`window.__game` 只在 dev 构建里赋值
（`src/main.js` 的 `import.meta.env.DEV`），拿静态 dist 去等它是等一扇永不打开的门。
`e2e-advisor.mjs` 自己起一个随机空闲口的 vite dev、跑完自己收；CDP 打开页面后用
localStorage seed 打开在线伙伴、点 FAB、送出问题，再等一个非空回答气泡。
`server/scripts/e2e-advisor-boot.ps1` 把六件套起到 28xxx 段。CI 不跑这条（零外呼纪律）。

## 设计说明

- **纯内存实现**：刻意零数据库/零消息队列，避免引入运维负担；遥测队列超限丢弃最老事件。
  生产化路径：TelemetryService → Kafka/Redis Stream，LeaderboardService → Redis ZSET/PostgreSQL，
  代码结构已按"接口 → 实现"分层，替换成本极低。
- **API 契约**：gateway 对外只暴露 `/api/**`；`lb://game-service` 按服务名转发，多实例可水平扩容。
- **配置中心的地址**：`game-service` 用 `spring.config.import=optional:configserver:http://localhost:8888`。
  切勿把 `SPRING_CONFIG_IMPORT` 设给 config-server 本身（它会回拉自己，HTTP 工作线程写满，健康检查假死——
  这是本开发机上真实踩过的坑，见冒烟脚本注释与 git 提交信息）。
- **注册名**：本地联调建议 `EUREKA_INSTANCE_HOSTNAME=localhost` + `EUREKA_INSTANCE_PREFERIPADDRESS=false`
  （否则注册成 `host.docker.internal`，网关从本机访问路由失败）。

## 与游戏的对接（W-X2）

游戏侧已有可选客户端（默认关闭）：`src/online/OnlineServices.js`。

- 开启：`localStorage['crossrealm_online'] = '1'`（或 URL 参数 `?online=1`）；
- 网关：`localStorage['crossrealm_online_base_url']`，缺省同源 origin，本地默认 `http://localhost:8080`；
- 当前挂钩：击杀 Boss → 静默上报 `boss_defeated` 遥测（`postTelemetry`，不阻塞、网络差吞错）；
- 未做（留给后续）：排行榜提交 UI、排行榜面板、设置里的可选开关。

## 与游戏的对接（现状，W-Y2 / W-Y4 更新）

游戏本体仍**完全离线可玩**，在线能力全部可选。`OnlineServices` 当前已接：
Boss 击杀遥测、两张榜 + 足迹摘要（W-G2/G3/G4）、赛季词缀、以及星轨顾问
（F7 面板 / `askAdvisor` / `fetchAdvisorHealth` / `fetchEchoHint`）。
W-Y4 的 429 背压在面板里是「问星图的人有点多，队列暂时满了」，并落到 degraded 档
而不是 offline —— 服务活着、只是这一刻接不下，不该让玩家去检查网关。

剩余可扩展面：把 `/api/ai/chat/async` 的提交→轮询接成面板里的「后台继续问」路径
（当前面板仍走同步端点，异步端点供需要立刻拿回控制权的客户端使用）。

## 版本与兼容

- Java 17+（本机验证 25.0.1）
- Spring Boot 3.5.16 / Spring Cloud 2025.0.3
- Gateway 属性前缀：`spring.cloud.gateway.server.webflux.*`（4.x 起弃用旧的 `spring.cloud.gateway.routes`）
