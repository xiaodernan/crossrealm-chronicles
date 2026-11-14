# W-Z79 压测基准线报告（2026-11-14，Windows 本机）

> 本报告来自修前 / 后的两批数据对比，**本机 `-28081` 端口**（`EUREKA_CLIENT_ENABLED=false` / `SPRING_CLOUD_CONFIG_ENABLED=false` 隔离）。Redis 不可用（docker 被 `career-os-backend` 长期占用，见 server/README.md）。

---

## 修前 — 症状（写路径完全挂死）

| 场景 | 并发 | 结果 | p50 | p95 | p99 | max | errRate |
|------|------|------|-----|-----|-----|-----|---------|
| writeBurst | 40 | `issued=200 ok=0` | 3010 ms | ~3030 ms | – | ~3030 ms | **100%** |

**全部 201 都没有返回**——服务器不是 CPU 瓶颈：CPU idle、内存 low、`mvn verify` 全绿。问题在线程栈：

```
ConcurrentHashMap.clear() 持 bin ReservationNode
  → rebuildTop() 的 Lambda → synchronized (runs) 等
  → 而 runs 锁持有者（写线程）正卡在 CHM 里某 bin 等 ReservationNode
```

AB-BA 反序竞争（`leaderboard` 与 `trial` 两张榜同形态）——所有写入无限 BLOCKED，Tomcat 工作线程全部饿死，进程表面“活着”，实际零吞吐。

## 修法（三处改一对）

1. `topCache` 从 `final ConcurrentHashMap + synchronized(topCache){}` → **`volatile Map` + 整表换实例**（O(1)，无 CHM bin 锁）
2. 易主/双冠 Feign 外呼从 `synchronized (runs)` **移出**（调用保持同步、同顺序、同姿态；单测不受影响）
3. `top()` 从 `computeIfAbsent`（Lambda 又 `synchronized(runs)`）改为 **`runs` 锁内双检 + 全量写回** —— CHM 只用 get/put，不再触 bin 锁

顺带：**notify-mirror Feign 从请求线程脱离**（新增 `AsyncNotifyMirrorService`：daemon `notify-mirror-dispatch` 线程 + 256 槽有界队列、满丢最旧、`game-service.notify-mirror-async=false` 可回滚）。notification-service 不答时易主几秒不再拖慢任何写请求；`mirror` 同时报告 `queued`/`dropped` 两个计数跑到了 ops 视图上。

## 修后 — 基准线（`seed=42`, `concurrency=100`, 20s duration）

| 场景 | issued | ok | 4xx/5xx | p50 | p95 | p99 | max | 估算吞吐 |
|------|--------|----|---------|-----|-----|-----|-----|----------|
| readBurst | 43,155 | 43,155 | 0/0 | 43 ms | 65 ms | 134 ms | 229 ms | **~2151 rps** |
| writeBurst | 17,593 | 17,593 | 0/0 | 32 ms | 49 ms | 77 ms | 134 ms | **~1171 rps** |
| telemetryFlood | 14,298 | 14,298 | 0/0 | 57 ms | 82 ms | 139 ms | 229 ms | **~1425 rps** |
| mixed (70/30) | 30,728 | 30,728 | 0/0 | 35 ms | 71 ms | 112 ms | 418 ms | **~1532 rps** |
| idempotentReplay | 200 | 200 | 0/0 | 29 ms | 116 ms | 119 ms | 120 ms | **~702 rps**（`X-Idempotent-Replayed: true` 全部确认） |

与「修前 100% 抖动、吞吐 0」构成根本性反差，且不是量级差。

## 使用方式

```bash
mvn -o -pl game-service -am package -DskipTests
java -Dserver.port=28081 -jar server/game-service/target/game-service-0.1.0-SNAPSHOT.jar &
npm run stress -- --scenario mixed --target http://localhost:28081 --concurrency 60 --duration 20
```

脚本：`scripts/stress-load.mjs`——Node 零依赖，退出码 `errRate > 0.02` 或任一 5xx ⇒ 1。可接入 CI（建议为 server-CI 增加一个 "stress" job，不作为合并门禁）。

## 已知限制（诚实声明）

- **单机、无 Redis**：多实例跨重启 Redis 背板不构成本节结论，依赖 CI 的 9 个 `verify-redis-*` 脚本为准。
- **本机 loopback 行为**：Windows 本机未监听端口的 RST 要 2–4 秒；本节 read/write 全部命中正常路径；只在 `AsyncNotifyMirror` 脱离后端请求线程后体现到表中——若直接测到 notification-service 不存在时的同步路径，应观察到在 <80ms 完成写请求。
- **完全没有压测的已建立服务端配置**：本机 `-28081` 只启用了 memory backends（`presence.backend=memory`、`leaderboard backend=memory` 等）。

---

*文档随提交 `418ec36`+W-Z79 ADR 产出，作为 W-Z79 证据链附页。*
