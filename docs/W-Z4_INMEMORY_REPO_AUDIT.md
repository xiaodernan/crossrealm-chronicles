# W-Z4 · 内存仓储复杂度盘点（为「要不要上数据库」做输入）

**本文目的**：在决策 W-Z4「是否引入持久层」之前，先量化 game-service 目前三个内存仓的实际复杂度，拍板时有数可查。

**范围**：只审 `server/game-service` 里真正起行为的三个存储——Boss 榜、试炼榜、遥测窗口；生固化 W-P1 / W-P5 / W-M1 / W-P12 / W-M2 的工程决策，不是重测。

---

## 1. 三个仓的真实结构

| 仓 | 数据结构 | 写 | 读（缓存未命中） | 缓存未命中率 | 容量上限 |
|---|---|---|---|---|---|
| Boss 榜（`LeaderboardService`） | `ArrayList<RunRecord>` | `O(1)`（`runs.add`）+ 清缓存 | `O(n log k)`，k = `maxLimit`（本文默认 ≤50）；命中的 `topCache` 按 `limit` 分桶，命中 O(1) | 写多清空、读多 O(1) | 无显式上限（im 内存） |
| 试炼榜（`TrialLeaderboardService`） | `ArrayList<TrialRun>` | 同上 | 同上，附加 `seasonId:limit` 分桶 | 低 | 有，`maxEntries`（超出后丢最老） |
| 遥测（`TelemetryService`） | `ArrayDeque<TelemetryEvent>` | `O(1)`，offer 进有界 inbox `ArrayBlockingQueue(1024)` | `count()` / `snapshot()` O(n)；`summarize` O(n log cap) | n/a | 硬上限 `maxEvents`（本文档所在环境=500） |
| Ops 聚合（`OpsController` → 全仓 `stats()`） | 同上三处聚合 | n/a | Boss 榜 `stats()` 是 `O(n log n)` 全排序；遥测 `summarize` O(n log k) | n/a | n/a |

`/api/ops/stats` 与 `/api/ops/health` 会打穿 Boss 榜的 `stats()`：即**每次 ops 读数都触发一次全量 sort**。

## 2. 被加重的场景

### 2.1 Boss 榜 `stats()` 全量排序

- 每次 `ops/stats` 调用 → `runs.stream().mapToLong(clearTimeMs).sorted().toArray()` → **O(n log n)**
- 输入：`runs.size()` 条目 + `uniqueBosses` 的 distinct count（O(n)）+ min/max/avg（O(n)，可合并但目前 4 次 reduce）
- 触发：`/api/ops/stats`、`/api/ops/health`（间接）、`LeaderboardTopKTest` 里的冒烟
- 性质：**debug-only 读，不是玩家热路径**（玩家只读 `/api/leaderboard?limit=N`，那走 `topCache`，命中 O(1)、写多写一次清空）

### 2.2 `/api/ops/stats` = “把整个生态打一遍”

`OpsController.stats()` 依次被三个仓消费一次：Boss stats + Trial stats + Telemetry summarize + TtlCache stats。全部是读，全归一次 `synchronized`，**O(n log n + n)**，不是逐次摊还——ops 读数不是热路径。

## 3. 结论（W-Z4 回答）

### 3.1 当前热路径是健康的，不需要持久层

- 玩家读：`/api/leaderboard?limit=N` → **topCache** 命中 **O(1)**
- 玩家写：`/api/leaderboard` → `synchronized` O(1) 追加 + 整表失效（清晰、不变量明确）
- 试炼：同上
- 遥测：生产者 offer O(1)，单消费者保序 drain，读侧 `drainPending()` 预热 → 无并发争用
- **本仓刻意零数据库依赖**，一旦引入持久层，就要额外引入迁移、备份、单源真值、双写一致性，反而恶化排障面积

### 3.2 唯一值得记下的风险

`OpsController.stats()` 对 Boss 榜**每次调用**都做全量排序：n 大了会慢。

- 阈值：写多少从 O(n log n) 变成不可接受，按本环境 N ≤ 500（不持久、重启清零）→ **不存在为了这么小的 n 去做 pre-sort 索引**的必要
- 真正的处理是：当且仅当 ops 读成为生产热路径 / 或 `maxEntries` 上调到万级，再看这一条；写下“遇到线程安全 + 千级 N 再说”，不在本文预判方案
- 若需要持久层：在当下这个服务边界里，唯一合理的方向是 **Redis Streams 兼做持久榜**，而不是 Redis++ / Postgres——“榜单就是内存集合”，Redis 化排行榜条合理但要花 W-P10 的活儿

### 3.3 重构方向（若哪天真要动）

| 处置 | 价值 | 代价 |
|---|---|---|
| `stats()` 分桶维护 P50/P95/min/max/avg 的并查结构（例如两个堆 + 计分寄存器） | O(1) ops 读数 | 需要线程安全分桶，字段量变大 |
| 给 `runs` 加按需持久化（Redis 作持久主存 + 内存作读副本） | 无损复位机械故障 | 引入持久层、双写、迁移；本仓库目前不值得 |
| 不动 | 零复杂度、零成本 | ops 读慢、重启清零 |

**结论**：W-Z4 的“要不要上数据库”在当前环境下的回答是**不上**。任何进一步的持久化讨论，应以“本环境已改口”为前提：引入了多实例、要持久、要查询模型，再回头开 W-Z4 切片2。

---

## 4. 附 ADR 一条

- **为什么不是 Redis ZSET 立即上**：W-P10 (Redis-backed rate limiter fail-open) 是限流侧；排行榜变持久意味着玩家跨实例、服务端关掉能恢复——这属于 W-Z1 跨实例语境，不是“为了让少量 O(n log n) 变快”。
- **为什么不是 Postgres**：在零额外基础设施（零基础设施是本仓库硬约束）前提下引入数据库，会强制把迁移、备份、连接池、测试矩阵引入 CI 和运维面，本次收益否。
- **为什么 P50/P95 不做 quickselect**：数据小 + 写低，堆结构收益微薄，且容易引入新错误；优先级在别的切片。
