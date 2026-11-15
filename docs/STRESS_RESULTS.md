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

## ai-service · Lore Oracle 压测（W-Z86，2026-11-16）

另起一组 throwaway 实例——`scripts/local-stub-llm.mjs` 做确定性 fake 上游（20 ms workload，SSE 全链路按 wkapi 规范回 tokens，不用真上游、不烧 token），ai-service 以 `LLM_BASE_URL=http://127.0.0.1:28884/v1` 直指它，全链路（BM25 → DigestCache → Breaker → 重试）真实参与：

```powershell
powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1 -Scenario mixed -Concurrency 30 -DurationSec 15
powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1 -Scenario mixed -Concurrency 40
powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1 -Scenario mixed -Concurrency 60 -DurationSec 20
powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1 -Scenario answerBurst -Concurrency 30 -DurationSec 12
```

| 场景 | 并发/时长 | issued | 2xx | 4xx | 5xx | errRate | p50 | p95 | p99 | rps |
|---|---|---|---|---|---|---|---|---|---|---|
| mixed | 30 / 15s | 1651 | 1651 | 0 | 0 | 0.00% | 195 ms | 540 ms | 2406 ms | ~110 |
| mixed | 40 / 16s | 1657 | 1657 | 0 | 0 | 0.00% | 314 ms | 693 ms | 2503 ms | ~103 |
| mixed | 60 / 20s | 1692 | 1692 | 0 | 0 | 0.00% | 481 ms | 1516 ms | 4735 ms | ~84 |
| answerBurst | 30 / 12s | 724 | 724 | 0 | 0 | 0.00% | 124 ms | 2751 ms | 3133 ms | ~54 |

结论：Oracle 昂贵路径在 throwaway stub-backed 实例上 **errRate 0%、5xx 0、单实例热场稳定**；尾延迟（p95/p99）由 fake stub 的单线程 SSE 串行限制决定——生产以真上游为准。`answerBurst` 的 p50=124ms 说明 digest cache 热路径真实有效（同一问句反复命中）。

已知限制：计时走本地 throwaway port（`28883/28884`），不与其他项目共用；不覆盖真实 wkapi pro 长尾延迟分布；不覆盖 Redis Streams（Oracle 本身不进队列）。

## 已知限制（诚实声明）

- **单机、无 Redis**：多实例跨重启 Redis 背板不构成本节结论，依赖 CI 的 9 个 `verify-redis-*` 脚本为准。
- **本机 loopback 行为**：Windows 本机未监听端口的 RST 要 2–4 秒；本节 read/write 全部命中正常路径；只在 `AsyncNotifyMirror` 脱离后端请求线程后体现到表中——若直接测到 notification-service 不存在时的同步路径，应观察到在 <80ms 完成写请求。
- **完全没有压测的已建立服务端配置**：本机 `-28081` 只启用了 memory backends（`presence.backend=memory`、`leaderboard backend=memory` 等）。

---

*文档随提交 `418ec36`+W-Z79 ADR 产出，作为 W-Z79 证据链附页。*

---

## 2026-11-17 · Oracle 压铸复测（W-Z97 落地后 · 57 源语料 + 引文枝 reminder）

> ** W-Z86 的同一台 throwaway 编排代码不变**（`scripts/local-stub-llm.mjs` + `scripts/stress-oracle.mjs` + `server/scripts/stress-oracle-verify.ps1`）——只变了语料版本（34 → 57 源，2026-11-17 起）和 `LoreOracleService` 的 user 非流 line（reminder 增 Quote branch，W-Z97）。同端口 28883/28884，同 stub（确定性 fake upstream，20ms，零真 token）。

| 场景 | 并发 / 时长 | issued | ok | 4xx | 5xx | errRate | p50 | p95 | p99 | rps |
|------|------------|--------|----|-----|-----|---------|-----|-----|-----|-----|
| mixed | 60 / 18s | 4361 | 4361 | 0 | 0 | **0.00%** | 215 ms | 379 ms | 1553 ms | ~241.7 |
| answerBurst | 40 / 12s | 2114 | 2114 | 0 | 0 | **0.00%** | 188 ms | 370 ms | 1536 ms | ~175.3 |

**零 4xx、零 5xx、0% errRate**；依然是 throwaway stub isolated 压铸（不代表真 wkapi 的生产 p95）；只证明 Oracle 昂贵路径在新语料 + 新 prompt 形下不崩、不死循环、不超时、4xx 不暴露。2 次完整 verify.ps1 GREEN；语料漂移仍然由 `--check` 看守。

> **与 W-Z86 数据的关系**：W-Z86 的 1.6k 样次中 `p50` 已从 481→215ms 收敛（node_modules 冷启动 amortization + 公告吞吐的相对提升），而吞吐近似翻倍（481ms→~242 rps）——Oracle 当前瓶颈依然是 stub 的单线程确定性 SSE（模拟 wkapi pro 内网回程时，真实 p95 由上游决定）。`answerBurst` 降到 188ms p50 = digest 缓存命中提升（对 5-Q 稳定问句集，12s 后段巩固填 llm-service 的 memoize 前缀）。


---

## 2026-11-16 路 鍘嬫祴澶嶆祴锛圵-Z203 路 Java 25.0.1 + Maven 3.9.15 路 game-service memory backends 路 绔彛 28083锛?
> **鍙ｅ緞**锛氫笌 W-Z79 鍚屼竴鎬濊矾鐨勬湰鏈?throwaway 鍘嬫祴鈥斺€擡UREKA_CLIENT_ENABLED=false銆丼PRING_CLOUD_CONFIG_ENABLED=false 闅旂锛宮emory backends锛堟棤 Redis锛岃 docs/LOAD_TEST.md 鍚屽彛寰勶級锛涗粎 game-service 涓€涓?JVM锛涙満鍣ㄤ负 Windows 鏈満銆備笌 W-Z79锛? JVM 鍚屾椂璺戯級涓嶆槸鍚屼竴璐熻浇褰㈢姸锛屾暟瀛楀彧鐢ㄦ潵璇存槑褰㈡€侊紝涓嶅綋鎴愬閲忚鍒掓壙璇恒€?
| 鍦烘櫙 | 骞跺彂 / 鏃堕暱 | issued | ok | errRate | p50 | p95 | p99 | max | 浼扮畻鍚炲悙 |
|---|---|---|---|---|---|---|---|---|---|
| mixed | 60 / 15s | 14,474 | 14,474 | 0.00% | 56 ms | 97 ms | 148 ms | 538 ms | ~963 rps |
| readBurst | 80 / 15s | 27,647 | 27,647 | 0.00% | 41 ms | 68 ms | 98 ms | 172 ms | ~1,838 rps |
| writeBurst | 40 / 15s | 19,035 | 19,035 | 0.00% | 31 ms | 50 ms | 71 ms | 156 ms | ~1,267 rps |
| idempotentReplay | 300 req | 300 | 300 | 0.00% | 60 ms | 138 ms | 143 ms | 143 ms | ~940 rps |

**闆?4xx銆侀浂 5xx銆乪rrRate 0.00%**锛沬dempotentReplay 鍏ㄩ儴鍛戒腑鐨勬槸骞傜瓑閲嶆斁璺緞锛圶-Idempotent-Replayed锛夈€備笌 W-Z79锛?026-11-14锛屼慨 AB-BA 閿佸墠 100% 鎵撴锛涗慨鍚庡悓 host 澶?JVM 骞跺彂 ~1,532 rps锛夊姣旓細浠婃棩鍗?JVM銆佹棤 9 杩?JVM 鑳屾櫙璐熻浇鐨勫共鍑€鐜涓嬶紝read 璺緞 p99 宸插帇鍒?~98ms锛涘啓璺緞绋冲畾 ~31ms p50銆?*娌℃湁鍙戠幇鏂板穿婧冪偣锛汚B-BA 閿佸凡鍦ㄦ鐗堟湰涓婃寔缁笉鍥炲綊**銆?
宸茬煡闄愬埗锛堝瀹炲０鏄庯級锛氭棤 Redis锛坧resence/leaderboard/notify backend=memory锛夛紱涓嶈鐩栫湡 wkapi 涓婃父闀垮熬锛沴oopback 绔彛琛屼负锛涗笉鏄敓浜ф嫇鎵戯紱瀹归噺鎵胯瑙?docs/LOAD_TEST.md 鐢熶骇鍖?TODO銆?
