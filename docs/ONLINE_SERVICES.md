# 在线伙伴服务使用与部署手册

《Crossrealm Chronicles》本体是**纯前端**的离线游戏——没有后端也能完整玩完 3–5 小时的主线。
本手册讲的东西完全是**可选项**：不管它，什么都不会坏。

## 它是什么

一套与本体完全解耦的 **Spring Cloud 微服务**示例/扩展位于 `server/`，提供：

- **Eureka 注册中心**（`discovery-server`，:8761）——各服务向它注册；
- **Spring Cloud Config 配置中心**（`config-server`，:8888）——`game-service` 的运行参数从这里下发（本地 native profile，内置 `config/game-service.yml`）；
- **Spring Cloud Gateway**（:8080）——对外唯一入口，`/api/**` 按服务名 `lb://` 负载均衡转发； **W-X5 熔断**（CircuitBreaker + orward:/fallback/503：路由链抛异常时快速 503 兜底，不是空响应、不是上游错误页） **W-X11 Retry**（`GET /api/version` 幂等可重试 的小路由带 backoff.Retry；主路由 `/api/**` 刻意不带——POST 提交 leaderboard 不能双写）；
- **game-service**（:8081）——排行榜 / 遥测事件 / 版本号 / 运维聚合视图，纯内存零数据库；
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


## 快速验证（5 分钟）

```bash
cd server
mvn -B verify          # 编译 + 跑 9 项单测
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

冒烟脚本会：

1. 先确认 28xxx 端口段空闲（避免与开发机上同机的其它 Spring Cloud 项目抢端口）；
2. 依次拉起 discovery → config → game-service → season-service → gateway（**日志落在临时目录 `crossrealm-server-smoke\`**）；
3. 逐一验证配置下发 → 服务注册 → 网关 `lb://` 转发 → 遥测计数 → **赛季直连**（`/api/seasons/active`）→ **Feign 聚合**（`/api/ops/season` 必须 `available:true`）；
4. 跑完自动关闭它拉起的五个进程（含 **warm-up 轮询等 `lb://` 注册表暖起来**，约 30 秒，之后每一步都是确定性断言）；网关熔断诊断见 `scripts/verify-breaker.ps1`（baseline 200 → 停掉 game-service 后 6 次 503 → 重新拉起后自愈 200）。
5. **配置热刷新（W-X9）**：脚本创建一个**临时 config 目录**（`target/smoke-config/`），给 config-server 设置 `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS=file:/…`，先让 game-service 拉到 `max-limit=4 / version-note=v1`；然后改写该目录的 `game-service.yml` 为 `max-limit=3, v2`，调 **`POST /actuator/refresh`** ——**不重启 game-service**，`/api/version` 立刻回显 `note=smoke-reload-note-v2`、排行榜 `maxLimit` 立刻变成 3。`/actuator/refresh` 的 `Content-Type` 必须是 `application/json`（空 body 也要），否则直接 415。

2026-11-10 实测全绿（配置下发、version 经网关、排行榜、遥测 POST+count、Eureka 3 应用注册、配置热刷新生效）。

## 端到端开关（浏览器里）

1. 跑 `scripts/smoke.ps1` 或 `docker compose up -d` 让网关起来；
2. 游戏页打开 DevTools console：`localStorage.setItem('crossrealm_online', '1')`（或访问 `?online=1`）；
3. 正常打一次 Boss，击杀后不要开别的工具，服务端 `GET /api/telemetry/events/count` 应 +1。

关掉：`localStorage.removeItem('crossrealm_online')`（或 `?online=0` 不生效——必须用 false/删除）。

## 部署

```powershell
cd server
mvn -B verify                       # 先产出各模块 target/*.jar
docker compose build                 # 四个镜像（直接打 verify 产物，构建期零联网）
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

## 已知坑（都被踩过并写进 `server/README.md` 与 ADR）

- `SPRING_CONFIG_IMPORT` 按 JVM 生效：把它导给 config-server 会让它从自己拉配置，HTTP 工作线程写满，**健康检查假死**（日志 0 字节的经典症状）；
- 本机 loopback 对**未监听**端口的连接 ~2–4 秒才 RST（疑似环回被过滤驱动接管），health poll 的 `-TimeoutSec` 必须 ≥ 25s；
- 注册名用 LAN/`host.docker.internal` 会让网关 `lb://` 解析后连不上，须 `EUREKA_INSTANCE_HOSTNAME=localhost` + `PREFERIPADDRESS=false`；
- `lb://` 冷启动有 **30 秒级** 的注册表缓存暖起窗口（eureka 刷新阈值）：游戏/网关刚起时第一拨请求**会落空（503）**，属预期；smoke 与 `verify-breaker.ps1` 都先轮询等到 200 再执行断言；
- 网关熔断（W-X5）**只截路由链抛出的异常**（比如 eureka 缓存里实例还活着时的连接拒绝/超时）；**无实例 short-circuit 是 LB 直接出的空 503、不经过熔断器**——两条路径都是 503，只有 body 形态不同；
- **`GET /api/version` 走专用优先路由（order=-1），带 `Retry` 滤镜**——冷启动 / 一次 502 不再把边端打回去；主路由刻意不带 `Retry`（避免 POST 双写）；
- **W-X12 限流（rate-limit by IP）**：`RateLimitByIpFilter`——`同 IP 10 秒内 60 次，超出返回 429 + JSON`；
Gateway 4.x 起路由配置前缀是 `spring.cloud.gateway.server.webflux.*`（旧的 `spring.cloud.gateway.routes` 只是迁移监听器警告）。

## 文件索引

- `server/` — Maven 多模块工程 + `scripts/`（smoke.ps1 / verify-breaker.ps1）+ `docker-compose.yml`
- `src/online/leaderboardFormat.js` —— 在线排行榜条目格式化（纯函数，W-X7）
- `server/scripts/verify-breaker.ps1` —— W-X5 网关熔断验证（手动诊断）
- `.github/workflows/server.yml` — CI（编译 + 单测 + 全链路冒烟）
- `src/online/OnlineServices.js` — 游戏侧客户端（默认关闭）
- `server/season-service/` — 赛季服务（名册 / 周期轮转 / 词缀契约）
- `docs/MASTER_PLAN.md` — §9 ADR：W-X1（服务搭建）/ W-X2（游戏接线）/ W-X3（部署与 CI）/ W-X5（网关熔断）/ W-X6（设置页开关）/ W-X7（只读排行榜面板）/ W-X9（配置热刷新）/ W-X11（/api/version Retry 滤镜）/ W-X12（IP 限流）/ W-X13（/api/ops/health 复合视图）/ W-X14（season-service：赛季名册 + 周期轮转 + Feign 熔断聚合）/ W-X15（/api/telemetry/summary 窗口频次摘要）/ W-X16（graceful shutdown 五模块统一）/ W-X17（ops/health 加 uptime 两格）/ W-X18（ops/health 回显 X-Request-Id）/ W-P1..W-P6（缓存线七连：堆顶K / Cache-Control / LRU / TTL / Spring Cache）/ W-P7（telemetry Cache-Control 两条）/ W-P8（X-Request-Id 关联契约 + smoke 回声）/ W-P9（Server-Timing RFC 9218 + smoke 回声）
