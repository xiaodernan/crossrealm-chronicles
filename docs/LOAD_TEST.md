# 压力测试与全链路自检（W-Z112）

## 为什么有这份文档

《跨界纪元》的后端是 Spring Cloud 微服务族（Eureka + Config + Gateway + 8 个服务）。
"在高并发下系统会不会崩溃"不能靠印象回答 —— 这里记下**真实测量结果**：
什么压力下扛住了、哪里按设计卸载、每条命令怎么复现。

## 环境口径（很重要，先读这个）

- 宿主：**Windows + Docker Desktop** 上的参考 compose（9 个 JVM 同时跑，另有同机其它项目常驻）。
  这不是生产拓扑；数字**只用来说明形态**，不当成容量规划的承诺。
- 替身：AI 链路全程走 `scripts/local-stub-llm.mjs`（固定 20ms 工作负载，模拟 wkapi.pro/v1 的
  SSE + `include_usage` + `cached_tokens`）。**全程没有打真 LLM，也不需要 token。**
- 宿主端口：默认 8761/6379/8080… 被同机其它项目占用，故网关压测端口用 `GATEWAY_PORT=18880`
  等 18xxx 段启动（`server/docker-compose.yml` 全部端口已参数化，见文件注释）。

## 三个工具各管什么（别拿洪水测交互）

| 工具 | 场景 | 说明 |
|---|---|---|
| `scripts/load-test.mjs --scenario=all` | 混合洪水压测 | 200–500 并发、每人固定假 IP（`--spoof-ips=true`）|
| `scripts/load-test.mjs --scenario=ai` | AI 洪水的卸载行为 | 验证 429/503 按设计 shedding，**不是**赢的场景 |
| `scripts/advisor-e2e.mjs` | 星轨顾问异步全链路 | submit→poll→done，测的是**玩家真实旅程**延迟 |
| `docker compose run --rm verify` | 一键全链路自检 | 网关→各服务→Redis→WS 冒烟门 |

## 实测记录（2026-11-15，9 服务 + Redis + Gateway 全起）

### 链路自检（`verify.sh`）：**全绿**
`/api/version`、`/api/leaderboard`、telemetry 写入、`seasons/active`（命中率 **0.997**）、
`ops/stats`（leaderboard p50=5.7s，telemetry dropped=**0**）、`presence`、`notify`
（Redis 台账 broadcast=true，`/actuator/springcloud` 显示 `ratelimit.backend=**redis**`、
`allowed=14481 rejected=6376` —— 洪水后限流器本身就是这份报告的一部分）。

### 混合洪水（200 并发、固定 200 个假 IP、15s）
```
version        n=  902     60.1 rps   p50≈890ms  p95≈1389ms  p99≈1535ms   errors=0
leaderboard    n=  600     40.0 rps   p50≈900ms  p95≈1377ms  p99≈1521ms   errors=0
seasons        n=  300     20.0 rps   p50≈902ms  p95≈1365ms  p99≈1533ms   errors=0
presence       n=  600     40.0 rps   p50≈908ms  p95≈1388ms  p99≈1535ms   errors=0
telemetry      n=  300     20.0 rps   p50≈914ms  p95≈1721ms  p99≈1775ms   errors=0
合计 3302 次请求 · 成功 3302 · 错误率 0.00% —— 没有 5xx，服务无重启。
```
（同机跑了 9 个 JVM + 其它项目，p50≈900ms 是**宿主饱和**的征兆，不是链路固有延迟；
干净 Linux 宿主上预期低一个数量级。正确读法：**系统没有崩、没有 5xx、卸载完全按设计发生。**）

### 同 IP 洪水（50 并发同 IP、10s，纯 `/api/version`）
`622.7 rps`，错误率 **52.8%** —— 全部是 `HTTP 429`（网关每 IP 60 次/10s 令牌桶，正确卸载）。
"系统没有崩" 的反面证据：它没有过载倒下，是**明确拒绝**。

### 混合洪水（50 并发、不同 IP）
```
p50≈157ms  p95≈250ms  p99≈280–550ms；错误率 5.98%（全部是 HTTP 429：每个假 IP
发到 6 rps 正好贴在桶的速率上）—— 限流器把每个 IP 都压在设计水位。
```

### AI 洪水（100 并发）
503/429 卸载（gateway circuit-open / 顾问队列满）——**设计内行为**，不是事故；
ai-service 进程自身全程 202 受理，网关在桶满后停止放行，有 `Retry-After`。
说明星轨顾问不是高 QPS 端点（它是给真玩家提问用的）。

### 星轨顾问异步全链路（30 题、5 并发）
```
完成 30 · 失败 20（submit-429，顾问队列在洪水后处于长期饱和——设计 shedding）
submit→done：p50≈33ms（热/重复态）· p95≈p99≈10.4s（BM25 检索 + 重排真实耗时）
```
真实玩家旅程 = 秒级响应；10s 量级是 BM25 编排的真实成本，不是事故。

## 实测记录（2026-11-17 · W-Z314 · 单 IP 洪水对修复后网关）

环境：同机 docker-compose 参考栈（discovery 18761 / config 18888 / game 28081 / season 28082 / ai 28083 / presence 28084 / notify 28085 / gateway **28080**（redis 限流背板）/ redis 26379 / postgres 15432），与 careeros / football-os 其它项目共存。网关镜像按 W-Z314 重建并重新部署（`mvn -f server/gateway/pom.xml test` 52/52 绿后打包，`GATEWAY_RATELIMIT_XFFTRUST` 默认 `false`）。

### 网关全链路自检（`docker compose run --rm verify`）：**全绿**（含 `/api/seasons/active`、`/api/telemetry/summary-rollup`；`notify backend=redis`，`allowed` 持续累计）。

### XFF 伪造实机验证（修复前后差异）

修复前（旧镜像）：轮换 75 个不同 `X-Forwarded-For` → 全部 `2xx`（限流桶按假 IP 分散 → 限流形同未启用）。
修复后（新镜像，默认不信任 XFF）：轮换 75 个不同 XFF → **前 60 次 `2xx`、第 61 次起全部 `HTTP 429`**（按远端地址计数）；不带 XFF 直打 → 同一 IP 桶全 429。结论：XFF 伪造无法绕过网关限流了。

### 单 IP 洪水（gateway 28080，共 ~65,000 次请求，**5xx 全 0**，全部卸载在 429）

| 场景 | 发出 | 成功(2xx) | 429 | 5xx | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|
| readBurst × 80 并发 × 15s | 19,465 | 120 | 19,345 | **0** | 50ms | 118ms | 300ms | 616ms |
| writeBurst × 40 × 15s | 17,823 | 56 | 17,767 | **0** | 29ms | 52ms | 80ms | 1212ms |
| telemetryFlood × 80 × 15s | 13,757 | 120 | 13,637 | **0** | 79ms | 150ms | 238ms | 488ms |
| mixed × 80 × 15s | 12,189 | 120 | 12,069 | **0** | 88ms | 169ms | 263ms | 412ms |
| idempotentReplay × 500 同键 | 500 | 60 | 440 | **0** | 102ms | 280ms | 373ms | 402ms |

解读：单 IP 洪水被 60 次/10s 令牌桶（Redis 后端）正确压在设计水位上，**网关没崩、熔断没被打到奇怪态、下游服务未被灌到错误侧**；`errRate` 按负载工具口径计（429 算失败）≈99%，但 `server=0` —— 卸载完全按设计发生。

### 直连服务容量（绕过限流器，测"服务本身能扛多少"）

| 直连目标 | 12s × 32 并发 | 2xx | 5xx | p50 | p95 | max |
|---|---|---|---|---|---|---|
| game-service `/api/leaderboard?limit=10` | 15,668 | **15,668** | **0** | 20ms | 52ms | 209ms |
| season-service `/api/seasons/active` | 18,001 | **18,001** | **0** | 18ms | 44ms | 191ms |

解读：本机按 **>1,300 rps** 直连读流量、**100% 2xx**，p50 20ms / p95 44–52ms。Node `stress-load.mjs` 出口（非浏览器）。

### W-Z314 代码修复（安全项）

`RateLimitByIpFilter.resolveClientIp` 旧实现**无条件信任 `X-Forwarded-For`**——对外网关上攻击者只需轮换 XFF 即可获得无限量桶。修复：默认只按 `RemoteAddress` 计数；仅在显式配置 `gateway.ratelimit.xff-trust=true`（`GATEWAY_RATELIMIT_XFFTRUST=true`，compose 默认 `false`）且处于受控 LB/反代（LB 清 XFF）时才取第一跳；拿不到对端地址时归入共享 `unknown` 桶（限流器永远不接收 null）。单元测试 6/6（含 XFF 第一跳解析、缺省不信任 XFF、空白 XFF 回退 remote address）；全量 gateway 测试 52/52 绿。

## 拒绝语义速查（读报告的方式）

| 状态码 | 含义 | 是病吗 |
|---|---|---|
| 429 + `rate-limited` + `retryAfterMs` | 网关 IP 令牌桶（默认 60/10s，Redis 后端） | 否，保护自身 |
| 429 + `advisor-queue-full` + `Retry-After` | 顾问任务队列满（capacity=64，`AI_JOB_CAPACITY`） | 否，保护 LLM 上游 |
| 503 + `advisor-unavailable`（circuit-open） | 网关熔断器打开（5xx 达 50% 持续 10 次窗口） | 否，保护下游 |
| 5xx（任何 500/502/504） | **统计上为零** —— 出现即为真故障 | 是 |

## 复现命令

```bash
cd server
# 启动（端口 18xxx 段；LLM_BASE_URL 指向本地 stub，不花钱）
DISCOVERY_PORT=18761 CONFIG_PORT=18888 GAME_SERVICE_PORT=18801 SEASON_SERVICE_PORT=18802 \
AI_SERVICE_PORT=18803 GATEWAY_PORT=18880 PRESENCE_SERVICE_PORT=18804 NOTIFICATION_SERVICE_PORT=18805 \
REDIS_PORT=16379 LLM_BASE_URL=http://host.docker.internal:28884/v1 LLM_API_KEY=sk-stub \
docker compose up -d

node ../scripts/load-test.mjs --scenario=all --users=200 --spoof-ips=true --target=http://localhost:18880
node ../scripts/advisor-e2e.mjs --jobs=30 --concurrency=5 --target=http://localhost:18880
docker compose run --rm verify

docker compose down   # 压测后必收，别在笔记本上长跑 9 个 JVM
```

## 2026-11-15 · Postgres 遥测落地盘实测（W-Z130）

### 架构（两条写路径，一条主）

`POST /api/telemetry/events`（经 Gateway 限流 + game-service 验证）→ W-M1 有界 inbox（1024 格，drop-oldest）→ 单消费者 `telemetry-drainer`：

1. 纯内存 deque（maxEvents=500）—— `/api/telemetry/summary` 的来源，与之前完全一致
2. **W-Z130 可选 Postgres sink**（`TelemetryJdbcSink`）：4096 格有界队列，单事务批量 ≤100 条 → `telemetry_events`，同时 UPSERT `telemetry_daily_rollup(day, type, count)`；启动一次 probe，连不上 ⇒ WARN 后自闭，游戏继续纯内存

### 实测（2026-11-15 11:00，Postgres 16-alpine :15432，game-service 容器内）

| 指标 | 值 |
|---|---|
| enqueued / written / failures（W-Z130 计数，/api/ops/stats → telemetryDbSink） | 463 / 463 / 0 |
| dropped（镜像 MAX queue full） | 0 |
| `telemetry_events` 行数（`psql`） | 463 |
| roll-up（day×type）：loadtest=424 · boss_kill=30 · canon_open=8 · smoke=1 | 463（与 events 对齐） |
| `/api/telemetry/summary-rollup` | `{"enabled":true,"days":14,"totals":{"boss_kill":30,…},"total":38}`（首次 38，后随 load 424→463） |
| 200 并发（同上批 load-test，整站 ~4666/4666 成功，0.00%） | telemetry 424 条，p50≈640ms p95≈1120ms，0 失败 |
| verify.sh（compose run --rm verify） | 全绿（VERSION/LEADERBOARD/TELEMETRY/SEASONS/OPS/NOTIFY/SPRINGCLOUD/summary-rollup 全 200） |

### 端口与下线

- 本机多个默认端口已被其他栈占（Careeros 系列在 8761/8080/8081）—— 本仓 dev 跑在 **18xxx** 口：DISCOVERY=18761、CONFIG=18888、GATEWAY=18880、GAME=18801、SEASON=18802、AI=18803、PRESENCE=18804、NOTIFY=18805、REDIS=16379、POSTGRES=15432（compose 内部网络照用 8080/6379/5432，端口映射只影响宿主机）
- `docker compose down` 停栈；`docker compose down -v` 清空 pg volume（跨重启 roll-up 丢失；下次启动 init 脚本重建两表）
- 没有 Postgres = sink 自闭而游戏完整可用（只是炉边盘看不到后端真值，页脚会如实说 "backend absent"）

### 验证路径

```bash
docker compose -p crossrealm-chronicles-server logs game-service | grep jdbc
curl http://localhost:18880/api/telemetry/summary-rollup
docker exec crossrealm-chronicles-server-postgres-1 psql -U crossrealm -d crossrealm -c 'SELECT * FROM telemetry_daily_rollup'
```
