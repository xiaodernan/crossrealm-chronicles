# Crossrealm Chronicles :: Server — The Online Partner (optional)

> English mirror of `server/README.md`. The game is **pure frontend** — it runs offline with no runtime dependencies. This directory is an **independent, optional** Spring Cloud backend (Java 17+ / Maven 3.9+) for the online surface. Refusing to connect it disables nothing in the game.

## Capabilities

| Capability | Implementation | Port (local default) |
|---|---|---|
| Service discovery / registry | Spring Cloud Netflix Eureka (`discovery-server`) | 8761 |
| Unified config server | Spring Cloud Config (`config-server`; native profile, classpath repo) | 8888 |
| API gateway | Spring Cloud Gateway 4.3 (reactive); `lb://` routing by service name | 8080 |
| Online partner business API | `game-service`: leaderboards / telemetry / version (pure in-memory, zero DB) | 8081 |
| Season service (W-X14) | `season-service`: season themes / affixes / period countdown (computed from `epochDay`, nothing stored) | 8082 |
| AI advisor (W-Y1) | `ai-service`: the Star-Rail Advisor (the only process holding the LLM key / selective retries / breaker / TTL cache) | 8083 |
| Live-coop presence (presence wave) | `presence-service`: POST heartbeat → beat → Set/Hash+TTL storage; SSE subscribers (`presence:events:{channel}` Pub/Sub); memory default / redis optional; stream at `/api/presence/{channel}/stream`; ops at `/api/presence/{channel}/ops` | 8084 |
| Fireside Herald (W-Z49) | `notification-service`: cross-service notification registry (POST `/api/notify` validates against a registry → ledger → Pub/Sub fan-out; `GET /api/notify/recent?limit=N` newest-first; `GET /api/notify/stats` per-kind counts; `GET /api/notify/ops` read-only allowlist); Redis List (LPUSH/LTRIM 50) + Hash (HINCRBY) ring ledger, 7-day TTL; memory default / `SPRING_CACHE_TYPE=redis` switches to the real shared ledger; broadcast is fire-and-forget; only ledger write-failures surface 503 | 8085 |
| Reliable task queue (W-Y4) | `ai-service`: submit → `POST /api/ai/chat/async`, poll → `GET /api/ai/jobs/{id}`; bounded queue / 2 workers / idempotency key / selective retry / dead letter / backpressure `429` | 8083 |

> **Fully decoupled from the game**: `npm run build` never sees it; unplugged, the game is byte-identical.

## Modules

```
server/
  pom.xml                # parent POM (Boot 3.5.16 + Spring Cloud 2025.0.3 BOM)
  discovery-server/      # Eureka registry (+ Dockerfile)
  config-server/         # Spring Cloud Config Server (classpath:/config repo, + Dockerfile)
  game-service/          # REST API (leaderboards / telemetry / version / ops views); OpenFeign over season-service
  season-service/        # season themes + affixes (cycle rotation + config-server override), standalone unit tests (+ Dockerfile)
  ai-service/            # Star-Rail Advisor: the only process holding LLM_API_KEY (+ Dockerfile / system-prompt.txt)
  presence-service/      # presence service (presence wave): heartbeat write + SSE push; memory default / PRESENCE_BACKEND=redis
  notification-service/  # Fireside Herald (W-Z49): notification registry; memory ledger default / SPRING_CACHE_TYPE=redis; fire-and-forget Pub/Sub
  gateway/               # Spring Cloud Gateway (/api/** → game-service, /api/seasons/** → season-service, /api/ai/** → ai-service, /api/presence/** → presence-service, /api/notify/** → notification-service)
  env.example            # env-var sample (no real values): copy to server/.env and fill LLM_API_KEY
  scripts/smoke.ps1      # smoke: six live instances, full chain (incl. 4j AI health / 4k async contract); self-closes
  scripts/verify-breaker.ps1     # W-X5 gateway breaker diagnostic: 200 → 503 → self-heal 200
  scripts/verify-redis-rate-limit.ps1  # W-P10 Redis rate-limiter backboard proof (throwaway redis; burst of 70; 61st gets 429; fail-open on redis stop; runs on every server change)
  scripts/verify-redis-season-cache.ps1 # W-S2 Redis season-cache proof (cache.type=redis: two identical reads, key exists, TTL≈300s, redis down = error, back up = heal; CI live)
  scripts/verify-redis-advisor-queue.ps1 # W-Z1 Redis advisor-queue proof (jobs.backend=redis: submit→DEAD with no key → DLQ → dead-letter whitelist hides player input; CI live)
  scripts/verify-redis-leaderboard.ps1  # W-Y5 Redis leaderboard mirror proof (backend=redis: three submissions → ZCARD=3 → restart instance → top-K restored; CI live)
  scripts/verify-redis-trial.ps1        # W-Y6 slice 3 Redis trial-board mirror proof (same shape; season filter & score-desc restore across restart; CI live)
  scripts/verify-prometheus.ps1  # W-Z10 Prometheus endpoint proof (Micrometer + JVM basics; scrape shows game_telemetry_* + jvm_memory_used_bytes)
  scripts/verify-prometheus-ai.ps1 # W-Z12 ai-service Prometheus endpoint proof (one real advisor chat + scrape ai_upstream_calls_total / prompt_tokens_total / cache_hit_ratio)
  scripts/verify-presence-redis.ps1 # live-coop presence proof (throwaway redis: beat → count=1 → raw keys → SSE snapshot replay + silver-leaf frame → state shared across restart; CI live)
  scripts/verify-notify-redis.ps1  # W-Z49 Fireside Herald proof (throwaway redis: publish → recent read-back → LLEN/HGET raw keys → cross-instance B sees the same row → stats backend=redis → /ops allowlist output; CI live)
  docker-compose.yml     # eight-container deploy (discovery / config / game / season / ai / presence / notification / redis) + one-shot verify container (also covers /api/presence/world/count and /api/notify/recent)
```

## Quick start

```bash
cd server
mvn -B verify                       # compile + run all nine unit suites
java -jar discovery-server/target/discovery-server-0.1.0-SNAPSHOT.jar   # :8761
java -jar config-server/target/config-server-0.1.0-SNAPSHOT.jar          # :8888
java -jar game-service/target/game-service-0.1.0-SNAPSHOT.jar            # :8081
java -jar season-service/target/season-service-0.1.0-SNAPSHOT.jar        # :8082
java -jar ai-service/target/ai-service-0.1.0-SNAPSHOT.jar                # :8083 (no LLM_API_KEY → 503, game unaffected)
java -jar presence-service/target/presence-service-0.1.0-SNAPSHOT.jar     # :8084 (memory ledger default, healthy without Redis)
java -jar notification-service/target/notification-service-0.1.0-SNAPSHOT.jar # :8085
java -jar gateway/target/gateway-0.1.0-SNAPSHOT.jar                      # :8080
```

Then hit `http://localhost:8080/api/leaderboard`, or this cycle’s season: `http://localhost:8080/api/seasons/active`.

One-shot verification (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

The smoke script brings all six instances up, verifies config push → service registration → gateway forwarding → telemetry count — the full chain. It uses the **28xxx** port block and asserts ports are free first (no clashes with other Spring Cloud projects cohabiting the dev machine), tears everything down at the end, and writes logs into a temp `crossrealm-server-smoke\` directory. (This repo’s CI — `.github/workflows/server.yml` — runs the same on every push, on a clean ubuntu runner.)

The gateway carries **W-X5 circuit breaking** (`spring-cloud-circuitbreaker-reactor-resilience4j`; semantics below) and **W-X11 Retry**: the idempotent `GET /api/version` path uses a dedicated route (`game-service-version`, `order=-1`) with backoff retry (≤2, 50→200ms, 502/503 only); **POST never retries**. game-service routes carry the `CircuitBreaker` filter (sliding window 10 / min 5 calls / 50% failure rate / 5s open / 3 half-open calls); route-chain exceptions fall through to `forward:/fallback/503` → `FallbackController` returns `503 + upstream-unavailable`. One honest boundary: **with zero instances in the eureka cache** (e.g. before the cache warms), Spring Cloud LoadBalancer short-circuits its own empty 503 — the breaker does not participate; both paths are 503, only the body differs. Diagnostic script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-breaker.ps1
```

## Config-server + deep health views

Deep **W-X13 health view** (`OpsController`, zero outbound calls): `GET /api/ops/health` answers in one call — service name / version / javaVersion / the `game-service.*` config currently bound (seed / max events / version note) + `inMemory.*` (record counts / telemetry event counts). Complementary to plain `/actuator/health`, which only answers liveness.

**W-Z59/W-Z60 — the herald-flow ledger (`notifyMirrors`)**: a new section on the same endpoint — `notifyMirrors:{available, published:{bossDefeated, seasonAdvance, trialDethrone, leaderboardDethrone, dualCrown, total}}` (local in-process counters; the mirror bean absent ⇒ `{available:false}`; present but `notify-mirror-enabled=false` ⇒ `published.total=0`). **W-Z60 dual-crown**: a leaderboard dethronement where the new Boss-board king simultaneously wears the trial-board crown (`TrialLeaderboardService.crownsHeldBy()` judges `top(1)` per season) ⇒ one extra `world` herald (「世界事件 · 双冠」) — with no behavioural drift for old construction paths (W-Z56 stays intact).

**W-Z65 idempotent submission**: `POST /api/leaderboard`, `POST /api/trials/runs` accept optional `X-Idempotency-Key` (`^[A-Za-z0-9_-]{1,128}$`, TTL 600s; only 2xx bodies are ledgered). No key ⇒ zero interception; same key + same body ⇒ byte-identical replay (`X-Idempotent-Replayed: true`); same key + different body ⇒ 409 `{"error":"idempotency-key-conflict"}`, the business path never runs; memory default (LRU+TTL) / `redis` shared ledger (`crossrealm:idem:{key}`, PX); fail-open; smoke §4t does the live replay + 409/400 paths.

**W-X12 IP rate limit**: gateway gained `RateLimitByIpFilter` (Spring Cloud Gateway GlobalFilter, order=-100, orthogonal to breaker/retry). `X-Forwarded-For` (trusted-proxy) or the connection remote address (fallback) is the key; same IP ≤60 requests in 10s; overflow ⇒ `429 + {"error":"rate-limited","retryAfterMs":…}`.

- Normal players and smoke never hit it (smoke does ~15 calls).
- 60 req / 10s blocks single-IP scraping and leaderboard farming.
- Caveat: a whole-netblock attacker (one IP, endless fresh users) bypasses this layer — production needs Redis + cluster-wide rate limiting; this is the local/single-machine first line. game-service’s `GameServiceProperties` is `@RefreshScope`; `/actuator/refresh` is exposed (`Content-Type: application/json`, empty bodies included). Edit `game-service.yml` — locally it’s a classpath file; to rehearse, mount smoke’s temp config dir via `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS` — **`file:` URIs must use forward slashes** — then `POST /actuator/refresh`: `/api/version`’s note and the leaderboard `maxLimit` both take effect with no process restart. `smoke.ps1` already does this.

## Docker deploy

One Dockerfile per module (packs the `*.jar` built by `mvn verify`; **no dependency download at image-build time** — ideal for offline / restricted networks):

```powershell
cd server
mvn -B verify                       # produce target/*.jar for all modules
docker compose build                 # seven images, zero network
docker compose up -d                 # boot (discovery → config → game-service → gateway, health-check ordered)
docker compose run --rm verify       # one-shot verify: version/leaderboard/telemetry/season/ops + seasons/stats + /api/ops/stats + /actuator/springcloud (all eight)
docker compose down
```

> **Reality check**: on this repo’s dev machine the Docker daemon is permanently occupied by another active project, so the full image build + stack boot was never validated locally. `docker compose config` passes; the Dockerfiles are statically checkable (six lines each; wget is included in the runtime image for healthcheck). The canonical health-check truth is `scripts/smoke.ps1` — every push runs it in CI. In the compose network services discover each other by name (`discovery`/`config`/`game-service`), a different world from the single-machine smoke on `localhost` — never mix the two.

## game-service API

| Method | Path | Meaning |
|---|---|---|
| GET | `/api/leaderboard?limit=10` | Boss boards (time-descending ascending — **fast first**; seeded demo data on boot) |
| POST | `/api/leaderboard` | Submit a clear `{runner,bossId,clearTimeMs,chapter}` |
| GET | `/api/trials/leaderboard?season=&limit=10` | Trial boards (**score descending**; default = cross-season all-time) |
| POST | `/api/trials/runs` | Submit a trial `{runner,seasonId,score,layersCleared,secondsLeft}` |
| POST | `/api/telemetry/events` | Report a player event `{type,detail}` (bounded cache) |
| GET | `/api/telemetry/events/count` | Current cached event count |
| GET | `/api/telemetry/events` | Inspect the cache (debug) |
| GET | `/api/telemetry/summary?topN=5` | Window-frequency summary `{windowSize,distinctTypes,byType:[{type,count}]}` (topN clamped to [1,20]) |
| GET | `/api/version` | Service version (carries the config-server `version-note`) |

Config flows from `game-service` over `spring.config.import=optional:configserver:…`:
`game-service.leaderboard.seed-demo-data` / `max-limit` / `game-service.trial.seed-demo-data` /
`max-limit` / `max-entries` / `telemetry.max-events` / `version-note`.

## AI advisor & reliable task queue (W-Y1 / W-Y2 / W-Y4)

The browser **never sees anything but the gateway**: `POST /api/ai/chat` and `POST /api/ai/chat/async`. Upstream base URL, `LLM_API_KEY` and the Authorization header live only inside the `ai-service` process; the config server carries no keys, and neither health nor any response body echoes them. The game-side Star-Rail Advisor panel (W-Y2, **F7**) goes through `OnlineServices.askAdvisor()`; offline / breaker / 429 each render a player-readable line and never block local play.

| Method | Path | Meaning |
|---|---|---|
| POST | `/api/ai/chat` | Sync question→answer `{question,context?}` → `{answer,model,cached,latencyMs}` |
| POST | `/api/ai/chat/async` | Submit `{question,context?,requestId?}` → `202 {jobId,status:queued,duplicate,pollAfterMs}`; full queue ⇒ `429 + Retry-After` |
| GET | `/api/ai/jobs/{jobId}` | Poll `QUEUED/RUNNING/DONE/DEAD`; DONE carries the answer, DEAD carries the machine reason; **player input never echoed** |
| GET | `/api/ai/jobs/stats` | Queue readings: capacity / depth / inFlight / rejected / dedupHits / retried / deadLettered |
| GET | `/api/ai/health` | configured / model / circuit / cache / upstreamCalls (allowlist, no secrets) |
| POST | `/api/ai/echo-hint` | One-line Echo-Lamp hint (shares the same cache / breaker chain as the advisor; different persona prompt) |

**Why the queue at all**: a real upstream round-trip takes 2–30s; synchronous endpoints would pin Tomcat worker threads on slow I/O. W-Y4 isolates resources with a bounded queue + 2 workers: a full queue fails loudly (`429`) instead of dropping silently or making callers wait; `requestId` is the idempotency key (retries never double-bill); only `upstream-*` / `circuit-open` get exponential backoff; exhaustion lands in a visible dead-letter. Tunables under `ai-service.jobs.*` (`AI_JOB_*` env override).

**Boundary (do not misread)**: this is a **process-local** queue — in-flight jobs die with the worker and instances do not share `jobId`s. Cross-instance reliability should be Redis Streams (consumer group + `XACK` + pending redelivery), not a distributed lock on a HashMap; the W-M5 Redis Pub/Sub is broadcast (offline = permanently lost) — the two are complementary.

Live upstream call (only when a key is provisioned; CI defaults to zero outbound / zero spend):

```bash
cd server
set -a; . ../.env; set +a
mvn -o -pl ai-service test -Dtest=AiLiveIntegrationTest,AdvisorJobLiveIntegrationTest
```

### Headless browser end-to-end (development machine, real Chrome required)

Three abandoned drafts from the merged branch were promoted into real tools, both with a security pass: **the boot script no longer hardcodes a secret** (refuses to start without `LLM_API_KEY` exported), and it no longer `Stop-Process -Name java -Force` (that kills unrelated Java projects — replaced by port pre-check + killing only the PIDs it started).

```bash
set -a; . ./.env; set +a                   # repo-root .env (gitignored)
powershell -ExecutionPolicy Bypass -File server/scripts/e2e-advisor-boot.ps1
npm run e2e:advisor                        # headless Chrome → F7 panel → real gateway → real model
```

**Why no `npm run build`**: `window.__game` is only assigned in dev builds (`src/main.js` guards on `import.meta.env.DEV`); waiting for it in static dist is waiting for a door that never opens. `e2e-advisor.mjs` starts its own random-free-port vite dev server and cleans up after itself; CDP opens the page, seeds `localStorage` to enable the online partner, taps the FAB, submits a question and waits for a non-empty answer bubble. `server/scripts/e2e-advisor-boot.ps1` brings the six services up on the 28xxx block. CI never runs this (zero-outbound discipline).

## Design notes

- **Pure in-memory** by deliberate choice: zero DB/MQ overhead; the telemetry cache evicts the oldest. Production path: `TelemetryService` → Kafka/Redis Stream, `LeaderboardService` → Redis ZSET / PostgreSQL. Code is layered interface → implementation, so swapping costs almost nothing.
- **API contract**: the gateway is the only public face for `/api/**`; `lb://game-service` routes by name; horizontal scale is a config-free addition of instances.
- **Config server address**: `game-service` uses `spring.config.import=optional:configserver:http://localhost:8888`. Do **not** set `SPRING_CONFIG_IMPORT` on config-server itself (it would pull from itself, saturating HTTP worker threads and fake-killing health checks — the classic empty-log corpse; see smoke script comments and git history).
- **Registration name**: for local joint debugging prefer `EUREKA_INSTANCE_HOSTNAME=localhost` + `EUREKA_INSTANCE_PREFERIPADDRESS=false` (otherwise it registers as `host.docker.internal`, and the gateway cannot route from the host machine).

## Stress testing (W-Z79)

`scripts/stress-load.mjs` — Node-zero-dependency five-scenario load driver:

```bash
mvn -o -pl game-service -am package     # build the jar
SERVER_PORT=28081 EUREKA_CLIENT_ENABLED=false SPRING_CLOUD_CONFIG_ENABLED=false java -jar game-service/target/game-service-0.1.0-SNAPSHOT.jar &
node scripts/stress-load.mjs --target http://localhost:28081 --scenario mixed --concurrency 60 --duration 20
```

Scenarios: `readBurst` (GET boards/event counts) → `writeBurst` (POST both boards) → `telemetryFlood` (telemetry flood) → `mixed` (7:3 r:w) → `idempotentReplay` (X-Idempotency-Key replay). Exit codes: errRate > 2% or any 5xx ⇒ 1. The first real run captured a genuine AB-BA ring-deadlock (`topCache.clear()` × `computeIfAbsent` × `synchronized(runs)`); after the fix — reads ~2151 rps / writes ~1171 rps, zero 5xx across all scenarios — see `docs/MASTER_PLAN.md` W-Z79.

## Partnering with the game (W-X2)

The game ships an optional client (off by default): `src/online/OnlineServices.js`.

- Enable: `localStorage['crossrealm_online'] = '1'` (or `?online=1`)
- Gateway base URL: `localStorage['crossrealm_online_base_url']`; default = same origin; local default `http://localhost:8080`
- Wired now: **Boss defeated → silent `boss_defeated` telemetry** (`postTelemetry`; non-blocking, network errors swallowed)
- Left for future passes: leaderboard submit UI, leaderboard panel, settings toggle

## Partnering with the game (current state, W-Y2 / W-Y4)

The game body remains **fully playable offline**; every online capability is opt-in. `OnlineServices` currently carries: Boss-defeat telemetry, both boards + footprint summaries (W-G2/G3/G4), season affixes, and the Star-Rail Advisor (F7 panel / `askAdvisor` / `fetchAdvisorHealth` / `fetchEchoHint`). W-Y4’s 429 backpressure surfaces in the panel as 「问星图的人有点多，队列暂时满了」and drops to *degraded*, not *offline* — the service is alive, merely unable to accept this one; don’t send players checking the gateway.

Remaining extensible surface: wire `/api/ai/chat/async` into the panel as a “keep asking in background” path (the panel still uses the synchronous endpoint; the async endpoint is for clients that need control back immediately).

## Versions & compatibility

- Java 17+ (verified locally on 25.0.1)
- Spring Boot 3.5.16 / Spring Cloud 2025.0.3
- Gateway property prefix: `spring.cloud.gateway.server.webflux.*` (Gateway 4.x; the old `spring.cloud.gateway.routes` only logs a migration warning)
