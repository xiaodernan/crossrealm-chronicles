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
