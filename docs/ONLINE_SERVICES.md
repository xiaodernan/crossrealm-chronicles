# 在线伙伴服务使用与部署手册

《Crossrealm Chronicles》本体是**纯前端**的离线游戏——没有后端也能完整玩完 3–5 小时的主线。
本手册讲的东西完全是**可选项**：不管它，什么都不会坏。

## 它是什么

一套与本体完全解耦的 **Spring Cloud 微服务**示例/扩展位于 `server/`，提供：

- **Eureka 注册中心**（`discovery-server`，:8761）——各服务向它注册；
- **Spring Cloud Config 配置中心**（`config-server`，:8888）——`game-service` 的运行参数从这里下发（本地 native profile，内置 `config/game-service.yml`）；
- **Spring Cloud Gateway**（:8080）——对外唯一入口，`/api/**` 按服务名 `lb://` 负载均衡转发； **W-X5 熔断**（CircuitBreaker + orward:/fallback/503：路由链抛异常时快速 503 兜底，不是空响应、不是上游错误页）；
- **game-service**（:8081）——排行榜 / 遥测事件 / 版本号，纯内存零数据库。

游戏侧对应的是 `src/online/OnlineServices.js`（W-X2，默认关闭）：

- 开启方式（任一种）：`localStorage['crossrealm_online'] = '1'`、网址参数 `?online=1`、`window.__CROSSREALM_ONLINE__ = true`；
- 网关地址：`localStorage['crossrealm_online_base_url']`，缺省同源 origin，本地默认 `http://localhost:8080`；
- 当前接线：**击杀 Boss → 静默上报名 `boss_defeated` 遥测**（吞错、1.5s 超时，零打扰）；
- 排行榜提交（`submitRun`）已实现但**尚未接入调用点**（仍等后续切片）；**设置页里的"在线服务"开关已落地（W-X6）**：默认关闭、独立于 SettingsStore，写 localStorage `crossrealm_online` 并翻运行时 `onlineServices` 单例（开关一翻即生效，不需重载）；排行榜面板仍在后续切片；
- 生产化路径（Redis ZSET 排行榜 / Kafka 遥测 / 真集群）在 `server/README.md` 有说明。

## 快速验证（5 分钟）

```bash
cd server
mvn -B verify          # 编译 + 跑 9 项单测
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

冒烟脚本会：

1. 先确认 28xxx 端口段空闲（避免与开发机上同机的其它 Spring Cloud 项目抢端口）；
2. 依次拉起 discovery → config → game-service → gateway（**日志落在临时目录 `crossrealm-server-smoke\`**）；
3. 逐一验证配置下发 → 服务注册 → 网关 `lb://` 转发 → 遥测计数；
4. 跑完自动关闭它拉起的四个进程（含 **warm-up 轮询等 `lb://` 注册表暖起来**，约 30 秒，之后每一步都是确定性断言）；网关熔断诊断见 `scripts/verify-breaker.ps1`（baseline 200 → 停掉 game-service 后 6 次 503 → 重新拉起后自愈 200）。

2026-11-10 实测全绿（配置下发、version 经网关、排行榜、遥测 POST+count、Eureka 3 应用注册）。

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
| `SPRING_CONFIG_IMPORT` | 从配置中心拉配置（**只给 game-service 设**） | `optional:configserver:http://localhost:8888` |
| `CROSSREALM_ONLINE_BASE_URL`（前端侧：`crossrealm_online_base_url`） | 前端网关地址 | 同源 origin |

## 已知坑（都被踩过并写进 `server/README.md` 与 ADR）

- `SPRING_CONFIG_IMPORT` 按 JVM 生效：把它导给 config-server 会让它从自己拉配置，HTTP 工作线程写满，**健康检查假死**（日志 0 字节的经典症状）；
- 本机 loopback 对**未监听**端口的连接 ~2–4 秒才 RST（疑似环回被过滤驱动接管），health poll 的 `-TimeoutSec` 必须 ≥ 25s；
- 注册名用 LAN/`host.docker.internal` 会让网关 `lb://` 解析后连不上，须 `EUREKA_INSTANCE_HOSTNAME=localhost` + `PREFERIPADDRESS=false`；
- `lb://` 冷启动有 **30 秒级** 的注册表缓存暖起窗口（eureka 刷新阈值）：游戏/网关刚起时第一拨请求**会落空（503）**，属预期；smoke 与 `verify-breaker.ps1` 都先轮询等到 200 再执行断言；
- 网关熔断（W-X5）**只截路由链抛出的异常**（比如 eureka 缓存里实例还活着时的连接拒绝/超时）；**无实例 short-circuit 是 LB 直接出的空 503、不经过熔断器**——两条路径都是 503，只有 body 形态不同；
- Gateway 4.x 起路由配置前缀是 `spring.cloud.gateway.server.webflux.*`（旧的 `spring.cloud.gateway.routes` 只是迁移监听器警告）。

## 文件索引

- `server/` — Maven 多模块工程 + `scripts/smoke.ps1` + `docker-compose.yml`
- `server/scripts/verify-breaker.ps1` —— W-X5 网关熔断验证（手动诊断）
- `.github/workflows/server.yml` — CI（编译 + 单测 + 全链路冒烟）
- `src/online/OnlineServices.js` — 游戏侧客户端（默认关闭）
- `docs/MASTER_PLAN.md` — §9 ADR：W-X1（服务搭建）/ W-X2（游戏接线）/ W-X3（部署与 CI）/ W-X5（网关熔断）
