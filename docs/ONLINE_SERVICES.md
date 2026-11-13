# 在线伙伴服务使用与部署手册

《Crossrealm Chronicles》本体是**纯前端**的离线游戏——没有后端也能完整玩完 3–5 小时的主线。
本手册讲的东西完全是**可选项**：不管它，什么都不会坏。

## 它是什么

一套与本体完全解耦的 **Spring Cloud 微服务**示例/扩展位于 `server/`，提供：

- **Eureka 注册中心**（`discovery-server`，:8761）——各服务向它注册；
- **Spring Cloud Config 配置中心**（`config-server`，:8888）——`game-service` 的运行参数从这里下发（本地 native profile，内置 `config/game-service.yml`）；
- **Spring Cloud Gateway**（:8080）——对外唯一入口，`/api/**` 按服务名 `lb://` 负载均衡转发； **W-X5 熔断**（CircuitBreaker + orward:/fallback/503：路由链抛异常时快速 503 兜底，不是空响应、不是上游错误页） **W-X11 Retry**（`GET /api/version` 幂等可重试 的小路由带 backoff.Retry；主路由 `/api/**` 刻意不带——POST 提交 leaderboard 不能双写）；
- **game-service**（:8081）——排行榜 / 遥测事件 / 版本号 / 运维聚合视图，纯内存零数据库；
- **ai-service**（8083，W-Y1）— **星轨顾问 / 回声灯**：本仓**唯一持大模型密钥**的进程（OpenAI 兼容 `/v1` 上游，10s 连接 + 20s 整体读超、只重试 timeout/429/5xx、SHA-256(模型+system+问题) TTL 缓存、三态熔断）。密钥**只从进程环境变量** `LLM_API_KEY` 进，不进配置中心、不进镜像、不进日志、不进响应体。网关路由 `/api/ai/**`（`lb://ai-service`，order=-1，带 Resilience4j 熔断；**POST 刻意不给 Retry**——非幂等，重试只会把一次提问放大成两次扣费）。游戏侧对应**星轨顾问面板**（`src/ui/AdvisorPanel.js`，W-Y2）：F7 唤出、跟随「在线伙伴服务」开关、模型回答只按 `textContent` 渲染（不可信文本绝不拼进 `innerHTML`）、断网/熔断/超时各自一句玩家文案；
- **season-service**（:8082，W-X14）——**赛季主题与词缀**：名册四套（灰烬 / 深颚 / 薄暮 / 辉煌），
  周期由 `season-service.cycle-days`（默认 14 天）配，当前赛季**算出来**而不是存下来
  （`epochDay / cycleDays`，多实例/重启/时区都不会给出两个答案）；`override` 可在配置中心强制指定，
  写错一个字母服务**拒绝启动**。gateway 路由 `/api/seasons/**`（`lb://season-service`，order=-1，带熔断）；
  `game-service` 用 **OpenFeign**（`SeasonClient` + `fallbackFactory` + Resilience4j 熔断）读它，
  在 `/api/ops/season` 聚合成一格运维视图 —— 下游没起时回 `available:false`，不 500。

游戏侧对应的是 `src/online/OnlineServices.js`（W-X2，默认关闭）：

- 开启方式（任一种）：`localStorage['crossrealm_online'] = '1'`、网址参数 `?online=1`、`window.__CROSSREALM_ONLINE__ = true`；
- 网关地址：`localStorage['crossrealm_online_base_url']`，缺省同源 origin，本地默认 `http://localhost:8080`；
- 当前接线：**击杀 Boss → 静默上报名 `boss_defeated` 遥测**（吞错、1.5s 超时，零打扰）；
- 排行榜提交（`submitRun`）**已接入：Boss 击杀时即提交通关记录**（W-X8，与遥测同一默认关闭/吞错曲线）；**设置页里的"在线服务"开关已落地（W-X6）**：默认关闭、独立于 SettingsStore，写 localStorage `crossrealm_online` 并翻运行时 `onlineServices` 单例（开关一翻即生效，不需重载）；**设置页里"在线服务"区的只读排行榜也已落地（W-X7）**：设置页内「刷新排行榜」按钮按下才拉一次 `/api/leaderboard?limit=10`，行文本走 `textContent`（服务端数据当不可信），拉不到/空榜走一句兜底提示；排行榜提交（`submitRun`）**已接入：Boss 击杀时即提交通关记录**（W-X8：record = `{runner:'adventurer', bossId, clearTimeMs, chapter}`；`clearTimeMs` = 本次页面进入到此刻的毫秒数，演示榜仅供排序，**不声称是通关时长**——全主线没有计时器）；遥测同路径同开关；
- **赛季（W-X14/W-F2）**：客户端 `fetchActiveSeason()` 打 `/api/seasons/active`；拿不到就用本地轮转
  （同一条 `epochDay / cycleDays` 规则），于是**离线也有赛季、在线只是确认**。赛季给的是词缀 id 列表，
  具体含义在客户端内容表里（服务端不认识游戏机制，加词缀不需要改服务端）。
- **位面试炼榜（W-F3 切片6）**：`POST /api/trials/runs` 提交、`GET /api/trials/leaderboard?season=&limit=`
  出榜。**这是第二张榜，不是 Boss 榜的一个分组** —— Boss 榜按**用时升序**排，试炼榜按**分数降序**排，
  "更好"的方向相反，合在一张表里只能靠猜。提交体是 `{ runner, seasonId, score, layersCleared, secondsLeft }`；
  赛季 id 参与**过滤**（轮换之后旧成绩不混进新榜），缺省 = 跨季总榜。内存有界（`max-entries`，超出丢最老的一条）。
  > 历史：切片1 曾经把 `trial-layer-N` 冒充 `bossId` 塞进 Boss 榜，代价是服务端多出五个不存在的 Boss
  > 而两张榜仍然分不开。切片6 把那条路彻底换掉了（`tests/trial-online.test.js` 有一条反面断言盯着）。
- **传说碑（W-G4 切片1）**：`GET /api/leaderboard?limit=` 终于有了消费者 —— 日志页【传说碑】页签（`src/ui/LegendsJournalTab.js`）：Boss 用时升序碑，成行、离线安静、bossId 过 `BOSS_ROSTER`（未登记走 `boss_name_unknown`）；`/api/telemetry/summary?topN=` 另由试炼页下半屏【行动风闻】画最近窗口频次 Top-N（`src/ui/TrialJournalTab.js`，W-G3）；
- 生产化路径（Redis ZSET 排行榜 / Kafka 遥测 / 真集群）在 `server/README.md` 有说明。

- **缓存（W-P1 → W-P9）**：game-service 的 Boss 榜 / 试炼榜都是**堆顶 K + 写穿惰性 memo**（O(n log k) 替代每次 O(n log n)），`/api/ops/health` 暴露 `hits/misses/entries` + `startedAt`/`uptimeSec`；season-service 接入 **Spring Cache 抽象**：三个只读端点 `@Cacheable`；默认 `spring.cache.type: simple`（ConcurrentMap，无 Redis 探活——`management.health.redis.enabled=false`），切到 `SPRING_CACHE_TYPE=redis` + `MANAGEMENT_HEALTH_REDIS_ENABLED=true` 就用 `RedisCacheManager`（5min TTL、JSON 序列化），整个调用路径不重改；**网关按路径 `Cache-Control`**：`/api/seasons/active` 300s + `stale-while-revalidate`、`/api/version` 60s、leaderboard 15s、`telemetry/summary` 5s、`telemetry/events` 与 `/api/ops/**` 一律 `no-store`（任何 4xx/5xx 也是 `no-store`）；**`X-Request-Id` 关联契约**（W-P8）：入站合法 id（1–64 可见 ASCII，排除逗号/分号/空白）原样透传，缺失/非法由网关生成 UUID；出行侧无条件钉住——每一次调用从网关到下游只有一个名字，排障能对齐；**`Server-Timing` 计时契约**（W-P9）：网关出口落 `gw;dur=<整数毫秒>`（前 commit 用 `add`，下游同名头原样保留、逗号拼接不覆盖），DevTools Network / curl `-w %{time_total}` 可直接拆开"网关耗时"与"下游耗时"；
**网关 ops 诊断端点**（W-P11）：`/actuator/springcloud`——身份（name/role/javaVersion/startedAt/uptimeSec）+ 限流（`backend`、`maxRequests`、`windowMs`、`trackedSize`、`allowed`/`rejected` 本实例累计 W-P13）+ 网关在场特性（retryOnVersion / circuitBreakerEnabled / serverTimingEnabled / xRequestIdEcho + `routesConfigured`）；只读、零外呼、不泄露路由表/实例名/IP；**`/api/ops/stats`**（W-P12，game-service）：leaderboard（fastest/slowest/avg/uniqueBosses）+ trials（topScore/avgScore/uniqueRunners/uniqueSeasons）+ telemetry（windowSize/distinctTypes/byType top5，复用 W-X15），零缓存零外呼；**`/api/seasons/stats`**（W-S1，season-service）：active 赛季 + 名册 + 缓存计数（`CountingCache` hits/misses/puts/invalidations + `hitRate`）——**W-S1 同时修掉了默认 concurrent 分支缓存项永不过期的陈旧读数**（Boot ConcurrentMapCacheManager 无 TTL；现 300s 惰性 TTL，`season-service.cache-ttl-seconds` 单源旋钮，与 redis 分支同一口径）。



## 快速验证（5 分钟）

```bash
cd server
mvn -B verify          # 编译 + 跑 9 项单测
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

冒烟脚本会：

1. 先确认 28xxx 端口段空闲（避免与开发机上同机的其它 Spring Cloud 项目抢端口）；
2. 依次拉起 discovery → config → game-service → season-service → ai-service → gateway（**日志落在临时目录 `crossrealm-server-smoke\`**）；
3. 逐一验证配置下发 → 服务注册 → 网关 `lb://` 转发 → 遥测计数 → **赛季直连**（`/api/seasons/active`）→ **Feign 聚合**（`/api/ops/season` 必须 `available:true`）→ **ai-service 健康经网关**（`/api/ai/health`：`model`/`circuit` 上报、响应体不含密钥；环境变量有 `LLM_API_KEY` 时**真实外呼** `/api/ai/echo-hint` 一轮，无 key 时跳过并注明）；
4. 跑完自动关闭它拉起的六个进程（含 **warm-up 轮询等 `lb://` 注册表暖起来**，约 30 秒，之后每一步都是确定性断言）；网关熔断诊断见 `scripts/verify-breaker.ps1`（baseline 200 → 停掉 game-service 后 6 次 503 → 重新拉起后自愈 200）。
5. **配置热刷新（W-X9）**：脚本创建一个**临时 config 目录**（`target/smoke-config/`），给 config-server 设置 `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS=file:/…`，先让 game-service 拉到 `max-limit=4 / version-note=v1`；然后改写该目录的 `game-service.yml` 为 `max-limit=3, v2`，调 **`POST /actuator/refresh`** ——**不重启 game-service**，`/api/version` 立刻回显 `note=smoke-reload-note-v2`、排行榜 `maxLimit` 立刻变成 3。`/actuator/refresh` 的 `Content-Type` 必须是 `application/json`（空 body 也要），否则直接 415。

2026-11-12 实测全绿（本机带 `LLM_API_KEY`：gateway→ai-service→wkapi.pro/v1 真实往返，回声提示正常返回；CI 无 key 时只断言启动/路由/健康）。
2026-11-10 实测全绿（配置下发、version 经网关、排行榜、遥测 POST+count、Eureka 3 应用注册、配置热刷新生效）。

## 端到端开关（浏览器里）

1. 跑 `scripts/smoke.ps1` 或 `docker compose up -d` 让网关起来；
2. 游戏页打开 DevTools console：`localStorage.setItem('crossrealm_online', '1')`（或访问 `?online=1`）；
3. 正常打一次 Boss，击杀后不要开别的工具，服务端 `GET /api/telemetry/events/count` 应 +1。

关掉：`localStorage.removeItem('crossrealm_online')`（或 `?online=0` 不生效——必须用 false/删除）。

## 星轨顾问链路（W-Y1 / W-Y2）

玩家侧入口：**F7**（或右下角常驻「星轨顾问」FAB）唤出面板；面板跟随**「在线伙伴服务」开关**——开关关着不发任何请求，也不渲染「问一句」控件。提问 → `POST /api/ai/chat`（{ question ≤400 字, context ≤8 条标量 }）；芯片上那句话就是真的发出去的问题（不另存一份）。答案只按 `textContent` 呈现，顶部状态胶囊四档（观星中 / 星图已连 / 顾问离线 / 星图不稳），失败按 `reason` 枚举分八句（未启用 / 超时 / 断网 / 坏 JSON / 空问题 / 已取消 / HTTP 拒绝 / 兜底）。

链式拓扑：

`前端 AdvisorPanel → OnlineServices（默认关闭；AbortController 真取消） → 网关 /api/ai/** (lb://ai-service, order=-1, aiServiceBreaker) → ai-service(:8083) → wkapi.pro/v1`

运维要点：

- **密钥只注入 ai-service 这一个 JVM**（`LLM_API_KEY`）；config-server 下发的 `ai-service.yml` 刻意不写密钥（仓库会被多人读、被 refresh 下发）；`env.example` 只有占位符；`.env` 已 gitignore；`.env` 从不入库（密钥走环境变量注入）；
- **网关 POST 无 Retry**：`forward:/fallback/advisor` 迎下游挂掉/超熔断（GET/POST 双映射，回 503 advisor-unavailable，不是 405）；
- 前端 Advisor 面板不做客户端重试（停止按钮 = 真 AbortController.abort，不是把按钮变灰继续烧钱）；
- **ai-service 自愈路径**：同一提问 120s 内命中 SHA-256 缓存（换模型/换 system 自动 miss）；熔断 OPEN 30s 后半开放行一次探测；`/api/ai/health` 上报 `configured/model/circuit/cache/upstreamCalls`，**白名单字段，不回声任何密钥或上游地址**；
- **回声灯**（`POST /api/ai/echo-hint`）与顾问共用同一条「摘要 → 缓存 → 熔断 → 选择性重试 → 解析」链路，只是 system prompt 不同（篝火边的旅人 ≠ 梦话先知）；
- 上线侧联调：`mvn -o -pl ai-service -am package -DskipTests` 后 `powershell -File .\scripts\verify-ai-service.ps1`（带 `LLM_API_KEY` 真打 chat + echo-hint 且答案非空；不带 key 则断言结构化 503 降级，零外呼）。


## 异步顾问队列与运维面（W-Y4 / W-Z1 / W-Z7 / W-Z8 / W-Z9）

- **异步队列（W-Y4）**：`POST /api/ai/chat/async`（202，`{jobId, status:"queued", duplicate, pollAfterMs}`；队列满 **429 + Retry-After**，这句不是「稍后再试」的敷衍，是背压明示）——慢速 LLM 从 Tomcat 线程隔离；2 个 worker、有界 64；只对 `upstream-*` / `circuit-open` 指数退避（≤3 次），耗尽进 DLQ（`ai:advisor:dlq`）；`requestId` 幂等（body > 网关 X-Request-Id header，幂等键客户端说了算）。入 Redis Streams 后端（`ai-service.jobs.backend=redis`）→ 跨实例 at-least-once（消费者组 + XPENDING 重投），缺 Redis 自动 fail-open 退回内存后端。轮询 `GET /api/ai/jobs/{id}`（不回显 question/context）；读数 `GET /api/ai/jobs/stats`（capacity/depth/pending/workers/inFlight/enqueued/rejected/dedupHits/done/deadLettered/cancelled）；
- **真取消（W-Z7 切片A）**：`POST /api/ai/jobs/{id}/cancel`——排队中 → 从 inbox/流条目拆除 + state tombstone 直写 CANCELLED（`cancelled:true`），这一问从未上游；运行中 / 已终结 → 200 + `cancelled:false` + `reason:already-running|already-terminal`（不谎称撤得回）；未知 → 404。撤回同时释放幂等键（`requestIds.remove` / `DEL dedup:<key>`）——撤回后同一 requestId 再问，走新的受理流程。
- **死信只读白名单（W-Z1 切片2）**：`GET /api/ai/jobs/dead-letter?limit=N`（默认 10，封顶 50）→ `{items:[{id, requestId?, reason, attempts}], count, limit}`——**question / answer / context 一律不出门**：玩家输入不该流进运维列表，排障要的是「同一类失败出现多少次」。
- **运维聚合派生 `/api/ops/advisor`（W-Z8）**：game-service 的 Feign（`AiServiceClient`）读 ai-service `/health` + `/jobs/stats`，两格各自 30s TTL 缓存、空 Map 即降级 `available:false`（reason:fallback），本地 try/catch 再保一层——运维视图永不 500。**单独一格，不进 `/api/ops/stats`**：stats 是本实例内存数据、零外呼，advisor 不能让 stats 继承外呼失败模式（与 `/api/ops/season` 同一先例）。前端设置页「星轨诊断」按钮（W-Z8 切片2）按下才拉，一句话显示 model/circuit/calls + depth/inFlight/rejected/deadLettered；行内全程 `textContent`。
- **结构化访问日志（W-Z9）**：game-service 与 ai-service 各一个 `AccessLogFilter`——一次请求一条 JSON 行 `{ts, app, requestId, method, path（不含 query/body）, status, durationMs}`；`/actuator` 不记；X-Request-Id 原样透出。
- **前端异步路径（W-Z7 切片B）**：星轨顾问面板的提问走 `OnlineServices.askAdvisorBackground`——提交 → `AbortSignal` 一拍一拍轮询（零裸计时器）到终态；「停止」= 断开轮询 + 发 cancel POST 撤回排队中的任务（LLM 已跑的撤不回，服务端诚实回 already-running）；DEAD 归并入「503 + advisor-unavailable」那格；429 → busy；连续 3 次轮询失败 → NETWORK。
- **smoke**：§4k（队列背压）/ §4l（X-Request-Id 贯通）/ §4m（/api/ops/advisor）/ §4n（撤回契约）/ §4o（死信白名单无玩家输入）/ §4p（`/api/ops/dead-letter` 聚合 + reason 直方图）。
- **Redis 背板顾问队列门禁（W-Z1 / `verify-redis-advisor-queue.ps1`）**：throwaway redis:7-alpine 上起 ai-service（`AI_SERVICE_JOBS_BACKEND=redis`），无 LLM_API_KEY 时 worker 确定性 not-configured→DEAD；验证提交→claim→DEAD→DLQ→死信白名单端点，且 `ai:advisor:jobs`/`ai:advisor:dlq` 流键真实存在（证明走了 Redis 后端不是内存后端），死信无玩家输入。每次 `server/**` push 都要过。
- **Redis 背板 rate limiter（`verify-redis-rate-limit.ps1`）/ 赛季缓存（`verify-redis-season-cache.ps1`）**：同一 CI 门禁下两个既有真 Redis 脚本——70 条突发 429 / `/api/seasons/active` 两次相同 + TTL≈300s。

## 部署

```powershell
cd server
mvn -B verify                       # 先产出各模块 target/*.jar
docker compose build                 # 六个服务镜像（直接打 verify 产物，构建期零联网）
docker compose up -d                 # 起栈（健康检查顺序编排）
docker compose run --rm verify       # 一次性 curl 三连验证
docker compose down
```

> 实测状态：本仓库开发机上 Docker 守护进程被同机另一个活跃项目长期占用，**本机未能完成镜像构建与起栈验证**；
> `docker compose config` 校验通过，且 CI（`.github/workflows/server.yml`，Temurin 21 + `pwsh`）每次 `server/**` 变更都会
> 跑 `mvn verify` + 完整 `smoke.ps1` 真起真打——这是守装配的权威口径。

## 环境变量速查

| 变量 | 作用 | 本地默认 |
|---|---|---|
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` | 注册中心地址 | `http://localhost:8761/eureka/` |
| `EUREKA_INSTANCE_HOSTNAME` | 注册名（本机联调建议 `localhost`） | 机器名 |
| `EUREKA_INSTANCE_PREFERIPADDRESS` | 用 IP 注册 | `false` |
| `SPRING_CONFIG_IMPORT` | 从配置中心拉配置（**只给 game-service / season-service 设**，绝不导给 config-server 自己） | `optional:configserver:http://localhost:8888` |
| `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS` | native profile 下 config-server 服务的配置仓库 —— 临时 smoke 用，把它指向 temp 目录以改写 game-service.yml | （classpath:/config） |
| `CROSSREALM_ONLINE_BASE_URL`（前端侧：`crossrealm_online_base_url`） | 前端网关地址 | 同源 origin |
| `LLM_API_KEY` | **ai-service 独占**的大模型密钥（不进配置中心 / 镜像 / 日志 / 响应体） | （空 = ai-service 以未配置模式启动，`/api/ai/health.configured=false`） |
| `LLM_BASE_URL` | OpenAI 兼容上游地址 | `https://wkapi.pro/v1` |
| `LLM_MODEL` | 模型 id（`/v1/models` 列出 `gpt-6-sol` 等） | `gpt-6-sol` |
| `CROSSREALM_ONLINE_BASE_URL`（前端侧：`crossrealm_online_base_url`） | 前端网关地址 | 同源 origin |

## 已知坑（都被踩过并写进 `server/README.md` 与 ADR）

- `SPRING_CONFIG_IMPORT` 按 JVM 生效：把它导给 config-server 会让它从自己拉配置，HTTP 工作线程写满，**健康检查假死**（日志 0 字节的经典症状）；
- 本机 loopback 对**未监听**端口的连接 ~2–4 秒才 RST（疑似环回被过滤驱动接管），health poll 的 `-TimeoutSec` 必须 ≥ 25s；
- 注册名用 LAN/`host.docker.internal` 会让网关 `lb://` 解析后连不上，须 `EUREKA_INSTANCE_HOSTNAME=localhost` + `PREFERIPADDRESS=false`；
- `lb://` 冷启动有 **30 秒级** 的注册表缓存暖起窗口（eureka 刷新阈值）：游戏/网关刚起时第一拨请求**会落空（503）**，属预期；smoke 与 `verify-breaker.ps1` 都先轮询等到 200 再执行断言；
- 网关熔断（W-X5）**只截路由链抛出的异常**（比如 eureka 缓存里实例还活着时的连接拒绝/超时）；**无实例 short-circuit 是 LB 直接出的空 503、不经过熔断器**——两条路径都是 503，只有 body 形态不同；
- **`GET /api/version` 走专用优先路由（order=-1），带 `Retry` 滤镜**——冷启动 / 一次 502 不再把边端打回去；主路由刻意不带 `Retry`（避免 POST 双写）；
- **reactive circuit breaker 的缺省 `TimeLimiter` 是 1 秒**（不是 Resilience4j 文档里常见的「无超时」口径）：LLM 一轮调用常态 2~30 秒——缺省会把每个 POST 都判「超时」打回熔断兜底。网关 `aiServiceBreaker` 已显式 `timeout-duration: 75s`（覆盖 ai-service 自身 20s timeout + 2 次重试 + 抖动），game/season/version 三条仍用缺省 1s（毫秒级端点，缺省是对的）；
- **`@Service` 有多个构造器时必须标 `@Autowired`**：Spring 找不到 `@Autowired` 的构造器会回退找缺省构造器——不存在 → 上下文整体启动失败，但站 mock 的单测照旧全绿、真 jar 起不来（本仓 2026-11-12 真撞上：ai-service 因此从未能 boot）。回归由 `AiServiceApplicationContextTest`（真 Spring 上下文 boot）接住；
- **smoke 默认无 `LLM_API_KEY`**：六服务启动 + `lb://` 路由 + `/api/ai/health` 字段断言在 CI 恒成立；只有进程环境变量里有 `LLM_API_KEY` 才走真实 echo-hint 往返（密钥永远不落文件）；
- **W-X12 限流（rate-limit by IP）**：`RateLimitByIpFilter`——`同 IP 10 秒内 60 次，超出返回 429 + JSON`；
Gateway 4.x 起路由配置前缀是 `spring.cloud.gateway.server.webflux.*`（旧的 `spring.cloud.gateway.routes` 只是迁移监听器警告）。

## 文件索引

- `server/` — Maven 多模块工程 + `scripts/`（smoke.ps1 / verify-breaker.ps1）+ `docker-compose.yml`
- `src/online/leaderboardFormat.js` —— 在线排行榜条目格式化（纯函数，W-X7）
- `server/scripts/verify-breaker.ps1` —— W-X5 网关熔断验证（手动诊断）
- `.github/workflows/server.yml` — CI（编译 + 单测 + 全链路冒烟）
- `src/online/OnlineServices.js` — 游戏侧客户端（默认关闭）
- `server/season-service/` — 赛季服务（名册 / 周期轮转 / 词缀契约）
- `server/ai-service/` — 星轨顾问 / 回声灯（唯一持有密钥；`verify-ai-service.ps1` 真调用验证）
- `src/online/OnlineServices.js` 的 `askAdvisor / fetchAdvisorHealth / fetchEchoHint` — 顾问链路的客户端出口（默认关闭、AbortController 真取消）
- `src/ui/AdvisorPanel.js` + `src/content/advisor.js` — 星轨顾问面板与客户端契约（一处线协议：原因枚举 / 限长 / 建议名册）
- `docs/MASTER_PLAN.md` — §9 ADR：W-X1（服务搭建）/ W-X2（游戏接线）/ W-X3（部署与 CI）/ W-X5（网关熔断）/ W-X6（设置页开关）/ W-X7（只读排行榜面板）/ W-X9（配置热刷新）/ W-X11（/api/version Retry 滤镜）/ W-X12（IP 限流）/ W-X13（/api/ops/health 复合视图）/ W-X14（season-service：赛季名册 + 周期轮转 + Feign 熔断聚合）/ W-X15（/api/telemetry/summary 窗口频次摘要）/ W-X16（graceful shutdown 五模块统一）/ W-X17（ops/health 加 uptime 两格）/ W-X18（ops/health 回显 X-Request-Id）/ W-P1..W-P6（缓存线七连：堆顶K / Cache-Control / LRU / TTL / Spring Cache）/ W-P7（telemetry Cache-Control 两条）/ W-P8（X-Request-Id 关联契约 + smoke 回声）/ W-P9（Server-Timing RFC 9218 + smoke 回声）/ W-P10（网关 IP 限流双背板 memory+Redis ZSET/Lua + fail-open）/ W-P11（/actuator/springcloud 网关诊断）/ W-P12（game-service /api/ops/stats 跨域聚合）/ W-P13（限流 allowed/rejected 计数）/ W-S1（season-service /api/seasons/stats + 默认缓存 TTL 修复 CountingCache） / W-Y4（异步队列提交→轮询、背压 429、幂等、死信）/ W-Z1（Redis Streams 消费者组 + 死信只读白名单）/ W-Z5（语料质检收官：echo-qa 77 / ach-qa 44、机制笔记复扫 bad=0）/ W-Z6（关联 ID 贯通 ai-service）/ W-Z7（真取消 + 前端异步队列接线）/ W-Z8（/api/ops/advisor + 设置页星轨诊断）/ W-Z9（结构化访问日志：game-service / ai-service 各一个 AccessLogFilter）
