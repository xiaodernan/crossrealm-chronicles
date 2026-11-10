# Crossrealm Chronicles :: Server —— 在线伙伴服务（可选）

《Crossrealm Chronicles》本体是**纯前端**的 Three.js 游戏，离线可玩、无任何运行时依赖。
本目录是一个**独立的、可选的** Spring Cloud 微服务后端（Java 17+ / Maven 3.9+），为联机场景提供：

| 能力 | 实现 | 端口（本地默认） |
|---|---|---|
| 服务发现 / 注册中心 | Spring Cloud Netflix Eureka（`discovery-server`） | 8761 |
| 统一配置中心 | Spring Cloud Config（`config-server`，native profile 内置 classpath 配置仓库） | 8888 |
| API 网关 | Spring Cloud Gateway 4.3（reactive），按服务名 `lb://` 负载均衡转发 | 8080 |
| 在线伙伴业务 API | `game-service`：排行榜 / 遥测事件 / 版本号（纯内存实现、零数据库） | 8081 |

> 与游戏本体**完全解耦**：`npm run build` 不感知它；不接它时游戏功能不受任何影响。

## 模块

```
server/
  pom.xml                # 父 POM（Boot 3.5.16 + Spring Cloud 2025.0.3 BOM）
  discovery-server/      # Eureka 注册中心
  config-server/         # Spring Cloud Config Server（classpath:/config 仓库）
  game-service/          # REST API（排行榜 / 遥测 / 版本），9 项单测
  gateway/               # Spring Cloud Gateway（/api/** → lb://game-service）
  scripts/smoke.ps1      # 冒烟脚本：四个实例真起真打，跑完自动关闭
```

## 快速开始

```bash
cd server
mvn -B verify                       # 编译 + 跑全部 9 项单测
java -jar discovery-server/target/discovery-server-0.1.0-SNAPSHOT.jar   # :8761
java -jar config-server/target/config-server-0.1.0-SNAPSHOT.jar          # :8888
java -jar game-service/target/game-service-0.1.0-SNAPSHOT.jar            # :8081
java -jar gateway/target/gateway-0.1.0-SNAPSHOT.jar                      # :8080
```

然后访问 `http://localhost:8080/api/leaderboard`。

一键验证（推荐）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

冒烟脚本把四个实例都拉起来，逐一验证
配置下发 → 服务注册 → 网关转发 → 遥测计数的完整链路，
默认使用 **28xxx** 端口段且先确认端口空闲（避免与开发机上同机其它 Spring Cloud 项目抢端口），
结束时自动关闭它拉起的进程，日志落在 `%TEMP%\crossrealm-server-smoke\`。

## game-service API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/leaderboard?limit=10` | 排行榜（按用时升序，启动时播种演示数据） |
| POST | `/api/leaderboard` | 提交通关记录 `{runner,bossId,clearTimeMs,chapter}` |
| POST | `/api/telemetry/events` | 上报玩家事件 `{type,detail}`，限容缓存 |
| GET | `/api/telemetry/events/count` | 当前缓存事件数 |
| GET | `/api/telemetry/events` | 查看缓存事件（调试） |
| GET | `/api/version` | 服务版本（含配置中心下发的 `version-note`） |

配置经 `game-service` 的 `spring.config.import=optional:configserver:…` 从配置中心拉取：
`game-service.leaderboard.seed-demo-data` / `max-limit` / `telemetry.max-events` / `version-note`。
配置中心离线时回退到本地默认值，互不影响。

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

## 与游戏的对接（后续）

当前无前端对接：游戏仍完全离线可玩。接入时最小改动方案：
游戏端增加一个可选的"在线服务客户端"（配置开关控制），把
`POST {GATEWAY}/api/telemetry/events` 与 `GET {GATEWAY}/api/leaderboard` 接上即可；
开发期可先用 `npm run e2e` 的演示流程压测遥测接口。

## 版本与兼容

- Java 17+（本机验证 25.0.1）
- Spring Boot 3.5.16 / Spring Cloud 2025.0.3
- Gateway 属性前缀：`spring.cloud.gateway.server.webflux.*`（4.x 起弃用旧的 `spring.cloud.gateway.routes`）
