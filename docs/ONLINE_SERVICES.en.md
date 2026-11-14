# Online Partner Services — Guide & Deployment Manual

> English mirror of `docs/ONLINE_SERVICES.md`. Technical names, service routes and field contracts are kept verbatim; where the two copies ever disagree, the Chinese original is canonical.
> 《Crossrealm Chronicles》 is **pure-frontend and offline-first** — the main story plays in 3–5 hours with no backend at all. Everything in this guide is **optional**; ignore it and nothing breaks.

## What it is

A set of **Spring Cloud microservices** fully decoupled from the game body, under `server/`:

- **Eureka registry** (`discovery-server`, :8761) — every service registers with it.
- **Spring Cloud Config** (`config-server`, :8888) — configuration pushed to `game-service` (native profile; built-in `config/game-service.yml`).
- **Spring Cloud Gateway** (:8080) — the only public entry; `lb://` routes `/api/**` by service name; **W-X5 circuit breaking** (`forward:/fallback/503` — route-chain exceptions fast-fail to a 503, never an empty reply, never the upstream error page) plus **W-X11 retry jitter** on the idempotent `GET /api/version` small route; the main `/api/**` route deliberately carries **no retry** — POSTing the leaderboard must never be double-submitted.
- **game-service** (:8081) — leaderboards / telemetry events / version / ops aggregate views; pure in-memory, zero DB.
- **ai-service** (:8083, W-Y1) — **the Star-Rail Advisor / Echo-Lamp**: the only process here holding the **real upstream LLM key** (`LLM_API_KEY`, OpenAI-compatible `/v1`; 10s connect + 20s overall read timeout; retries only on timeout / 429 / 5xx; SHA-256(model+system+question) TTL cache; three-state breaker). The key **enters only through a process environment variable** — never the config server, never an image, never logs, never a response body. Gateway route `/api/ai/**` (`lb://ai-service`, `order=-1`, Resilience4j breaker; **the POST route carries no Retry** — non-idempotent; retrying only amplifies one question into two billed calls). Game-side counterpart: the **Star-Rail Advisor panel** (`src/ui/AdvisorPanel.js`, W-Y2) — **F7** summons it, tied to the online-partner toggle, renders answers via `textContent` only (untrusted text is never concatenated into `innerHTML`); offline / breaker-open / timeout each have their own player-facing line.
- **season-service** (:8082, W-X14) — **season themes & affixes**: a roster of four seasons (Ash / Deepmaw / Dusk / Radiant), cycle configured via `season-service.cycle-days` (default 14). The active season is **computed, not stored** (`epochDay / cycleDays`) — multi-instance, restarts and timezones all agree. An `override` in the config server can pin a season; one typo refuses the whole service. Gateway route `/api/seasons/**` (`lb://season-service`, `order=-1`, breaker). `game-service` reads it over **OpenFeign** (`SeasonClient` + `fallbackFactory` + Resilience4j); `/api/ops/season` aggregates it into one ops tile — downstream down ⇒ `available:false`, never 500.
- **notification-service** (:8085, W-Z49) — **the Fireside Herald**: a cross-service notification registry. `POST /api/notify` (`{kind: achievement|season|world|system, title ≤120, body ≤500}`) persists via Redis List `crossrealm:notify:recent` (LPUSH+LTRIM 50) or an in-memory ring (chosen by `spring.cache.type`, default `simple`), counts per kind (Redis Hash `crossrealm:notify:stats` / in-memory), and broadcasts over Pub/Sub `crossrealm:notify:channel` (fire-and-forget `notify:radiate`). `GET /api/notify/recent?limit=N` serves the newest N first (limit clamped to [1,50]; malformed JSON items are skipped wholesale). `GET /api/notify/stats` → `{stored,totalPublished,byKind,backend}`. `GET /api/notify/ops` (W-Z52) — ops read-only allowlist `{backend, stored, capacity:50, totalPublished, byKind, channel}`; gateway route `/api/notify/**` (`lb://notification-service`, order=-1, breaker 50%/30s, TimeLimiter 3s, `forward:/fallback/503`). docker-compose pins `SPRING_CACHE_TYPE=redis` for real fan-out; CI runs `verify-notify-redis.ps1` live (publish → read back → `LLEN`/`HGET` raw keys → instance B sees the same row → `backend=redis`). Game-side counterpart: the advisor panel strip (W-Z49b, `src/online/notifyTracker.js` + `#advisor-notify`) — hidden entirely when offline; when online, fetched only while the panel is open; kind chips via whitelist mapping (both-locale five keys); all items rendered via `textContent`. **W-Z52 FAB gold dot** — 11px `.fab-notify-dot` on the FAB's upper-right, lit while unread > 0, dimmed on panel open. **W-Z50 auto-fill** — `TelemetryController` mirrors every `boss_defeated` (Feign → notification-service `world` event; controllability-safe; notification-service down ⇒ silent drop; telemetry stays 201). **W-Z53 season-advance auto-herald** — `SeasonBroadcastListener` mirrors `season:advance` to the herald ledger when `spring.cache.type=redis` is present.
- **presence-service** (:8084, presence wave) — **live-coop presence**: `POST /api/presence/{channel}/beat` (`{id,name,hue,x,z}`) → Redis hash (TTL 15s; heartbeat refreshes itself — no sweepers) + a channel member Set; `GET /api/presence/{channel}/count` for the fresh headcount (HUD); `GET /api/presence/{channel}/stream` an SSE stream — snapshot first (`present` × N + `snapshot-end`), then live beats (`presence:events:{channel}` over Redis Pub/Sub). Validation contract: channel/id whitelist regexes (`^[A-Za-z0-9_-]{1,32}$` / `^[A-Za-z0-9_-]{1,40}$`), control characters stripped + 24-char name cap, `hue` normalized to [0,359], `x/z` clamped to [-1,1], per-channel cap `maxWanderersPerChannel`, overflow ⇒ 429. Default `presence.backend=memory`; `PRESENCE_BACKEND=redis` switches to real fan-out (docker-compose). Gateway route `/api/presence/**` (TimeLimiter **3600s** — never cut an SSE open, breaker 50%/30s, `forward:/fallback/503`). Why SSE and not WebSocket: one-directional, auto-reconnect, no handshake upgrade; ops at `GET /api/presence/{channel}/ops` (members/fresh/capacity/sseConnections/backend/ttlSeconds, read-only, zero outbound calls).

The game-side client is `src/online/OnlineServices.js` (default off):

- Enable any of: `localStorage['crossrealm_online'] = '1'`, URL param `?online=1`, `window.__CROSSREALM_ONLINE__ = true`
- Gateway address: `localStorage['crossrealm_online_base_url']`; default = same origin (local dev: `http://localhost:8080`)
- Wired: **Boss defeated → silent `boss_defeated` telemetry** (fire-and-forget, 1.5s timeout, zero disturbance); **run submission** — leaderboard submit (`submitRun`) now ships with the Boss kill too (W-X8; same default-off/swalloing profile); record = `{runner:'adventurer', bossId, clearTimeMs, chapter}` — `clearTimeMs` = milliseconds from page entry, an unverified demo ranking only, **never claimed as total clear time** (the mainline has no timer). Telemetry uses the same path + same toggle.
- Settings-panel online section (W-X6/W-X7): default off, independent of SettingsStore; flips `crossrealm_online` + the runtime singleton live (no reload). The read-only leaderboard view (W-X7) fetches `/api/leaderboard?limit=10` only on press; rows via `textContent`; failures/empty boards show one fallback line.
- **Seasons (W-X14)**: `fetchActiveSeason()` → `/api/seasons/active`; fallback = the same `epochDay / cycleDays` rotation locally — **offline you get seasons too; online only confirms**. Affix ids come from the server; semantics live in the client content tables (the server knows no game mechanics; adding affixes needs no server change).
- **Trial boards (W-F3)**: `POST /api/trials/runs` submits; `GET /api/trials/leaderboard?season=&limit=` ranks — a second board, not a grouping of the Boss board. Boss boards rank **by time ascending**, trials by **score descending** — never merge them into one table. Body: `{runner, seasonId, score, layersCleared, secondsLeft}`; `seasonId` filters (post-rotation runs never mix into the new season); default = cross-season all-time; bounded in memory (`max-entries`, oldest evicted first).
- **Legends journal (W-G4)**: the journal’s **Legends** tab finally consumes `GET /api/leaderboard?limit=` — Boss-time-ascending steles; offline = quiet; `bossId` through `BOSS_ROSTER` (unlisted ⇒ `boss_name_unknown`). `/api/telemetry/summary?topN=` feeds the lower half of **Trial journal** (“Action Whispers”, `src/ui/TrialJournalTab.js`, W-G3).
- Production-like path (Redis ZSET leaderboards / Kafka telemetry / real cluster): see `server/README.md`.

**Caching (W-P1 → W-P9)**: both boards in game-service are **top-K + write-through lazy memo** (`O(n log k)` instead of `O(n log n)` every read); `/api/ops/health` exposes `hits/misses/entries` + `startedAt`/`uptimeSec`. season-service uses the **Spring Cache abstraction** — three read-only endpoints `@Cacheable`; default `spring.cache.type: simple` (ConcurrentMap, `management.health.redis.enabled=false`); switch on `SPRING_CACHE_TYPE=redis` + `MANAGEMENT_HEALTH_REDIS_ENABLED=true` → `RedisCacheManager` (5-min TTL, JSON serialization) with zero call-site changes. The gateway applies **per-path `Cache-Control`**: `/api/seasons/active` 300s + `stale-while-revalidate`, `/api/version` 60s, leaderboard 15s, `telemetry/summary` 5s, `telemetry/events` and `/api/ops/**` always `no-store` (4xx/5xx too). **`X-Request-Id` contract** (W-P8): legal inbound ids (1–64 visible ASCII, excluding commas/semicolons/whitespace) passed through untouched; missing/illegal ⇒ gateway generates a UUID; outbound legs pin it unconditionally — one name from gateway to downstream, debuggable end-to-end. **`Server-Timing` contract** (W-P9): the gateway stamps `gw;dur=<int-ms>` (add on commit; same-name downstream headers survive verbatim, comma-joined, never overwritten); DevTools Network or `curl -w %{time_total}` separates gateway time from downstream time directly. **Idempotent submission (W-Z65)**: `POST /api/leaderboard`, `POST /api/trials/runs` accept an optional `X-Idempotency-Key` (`^[A-Za-z0-9_-]{1,128}$`, TTL 600s): **no key ⇒ the idempotent path is entirely absent from the request (zero interception)**; `backend=memory` (default, per-process LRU+TTL) or `redis` (`crossrealm:idem:{key}` with PX, shared ledger across instances); same key + same body ⇒ replay 201 byte-identically (body preserved; `X-Idempotent-Replayed: true`); same key + different body ⇒ 409 `{"error":"idempotency-key-conflict"}` before any business code runs; ledger errors fail-open (treated as miss, business unaffected); docker-compose runs game-service with `GAMESERVICE_IDEMPOTENCY_BACKEND=redis` (Relaxed Binding via `-` separator).

**Gateway ops diagnostics** (W-P11): `/actuator/springcloud` — identity (name/role/javaVersion/startedAt/uptimeSec) + rate-limit state (backend, maxRequests, windowMs, trackedSize, allowed/rejected since start — W-P13) + gateway presence flags (retryOnVersion / circuitBreakerEnabled / serverTimingEnabled / xRequestIdEcho + `routesConfigured`); read-only, zero outbound, no route-table / instance-name / IP leakage. **`/api/ops/stats`** (W-P12, game-service): leaderboard (fastest/slowest/avg/uniqueBosses) + trials (topScore/avgScore/uniqueRunners/uniqueSeasons) + telemetry (windowSize/distinctTypes/byType top5, reuses W-X15), zero cache, zero outbound. **`/api/seasons/stats`** (W-S1, season-service): active season + roster + cache counters (`CountingCache` hits/misses/puts/invalidations + `hitRate`) — **and W-S1 also fixes the old non-expiring stale readings of the default ConcurrentMap branch** (Boot’s ConcurrentMapCacheManager had no TTL; now a 300s lazy TTL via `season-service.cache-ttl-seconds`, one knob for both branches).

---

**Stress testing (W-Z79, 2026-11-14)**: `scripts/stress-load.mjs` — Node zero-dependency, five scenarios (`readBurst` / `writeBurst` / `telemetryFlood` / `mixed` 7:3 / `idempotentReplay`), exit-code gate (errRate > 0.02 or any 5xx ⇒ 1), `--json` for CI consumption. Boot: `mvn -o -pl game-service -am package` → `java -jar target/game-service-0.1.0-SNAPSHOT.jar` (`28081` advised) → `node scripts/stress-load.mjs --scenario mixed --concurrency 60 --duration 20 --target http://localhost:28081`. First run exposed a genuine AB-BA ring-deadlock: leaderboard & trial boards both had `topCache` held as a monitor under `synchronized (runs)` and `ConcurrentHashMap.clear()` waiting on bin ReservationNodes — the write path was 100% timeouts (p50≈3000ms, 0 successful 201s). Fix: `volatile Map` whole-table swap, `top()` double-checked under `runs` lock (no computeIfAbsent), herald Feign calls moved off the critical section, new `AsyncNotifyMirrorService` (daemon + bounded 256-slot queue, drop-oldest). Result: **reads ~2151 rps / writes ~1171 rps / mixed ~1532 rps / idempotentReplay 200/200 — zero 5xx**. See `docs/STRESS_RESULTS.md` (before/after numeric archive), `server/scripts/stress-verify.ps1` (one-shot gate script; boots, hammers, asserts 5xx=0 / errRate≤0.02 / rps≥300), and `docs/MASTER_PLAN.md` W-Z79/W-Z79b ADR. Local Docker is permanently occupied by a separate project — Redis-backed stress tests live in CI (9 `verify-redis-*` scripts, all green).

## Quick verification (5 minutes)

```bash
cd server
mvn -B verify          # build + run 9 unit suites
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

The smoke script:

1. Asserts ports in the 28xxx block are free (no clash with other local Spring Cloud projects on the same machine);
2. Brings up discovery → config → game-service → season-service → ai-service → gateway in order (logs under `crossrealm-server-smoke\` in temp);
3. Verifies config push → service registration → gateway `lb://` routing → telemetry count → season direct link (`/api/seasons/active`) → Feign aggregation (`/api/ops/season` must report `available:true`) → ai-service health via gateway (`/api/ai/health`: model/circuit reported, response body carries no key; with `LLM_API_KEY` in env it also does a real **echo-hint** round-trip; without a key it logs “skipped — no key”);
4. Tears down everything it started (including the warm-up poll on `lb://` until the registry goes green — ~30s; every assertion after that is deterministic). Gateway breaker diagnostics: `scripts/verify-breaker.ps1` (baseline 200 → stop game-service → six 503s → restart → heals back to 200);
5. **Hot config refresh (W-X9)**: the script creates a **temp config dir** (`target/smoke-config/`), points config-server at it via `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS=file:/…`, boots game-service with `max-limit=4 / version-note=v1`, then rewrites `game-service.yml` to `max-limit=3, v2` and hits **`POST /actuator/refresh`** — **no restart of game-service** — `/api/version` immediately echoes `note=smoke-reload-note-v2` and the leaderboard `maxLimit` is instantly 3. `/actuator/refresh` **requires `Content-Type: application/json` even for an empty body** — anything else is an instant 415.

2026-11-12: all checks green with `LLM_API_KEY` present (gateway→ai-service→wkapi.pro/v1 real round-trip; echo adequately lands). CI (no key): asserts boot/routing/health only.

## End-to-end switch (in the browser)

1. `scripts/smoke.ps1` or `docker compose up -d` to get the gateway running;
2. In the game page’s DevTools console: `localStorage.setItem('crossrealm_online', '1')` (or `?online=1`);
3. Play a Boss; after the kill, check `GET /api/telemetry/events/count` — expected +1.

To turn off: `localStorage.removeItem('crossrealm_online')` (`?online=0` does nothing — you must use false/remove).

## The Star-Rail Advisor loop (W-Y1 / W-Y2)

Player entry: **F7** (or the bottom-right permanent “Star-Rail Advisor” FAB). Panel follows the online toggle — with it off, no requests, and the “ask a question” control never renders. Asking → `POST /api/ai/chat` (`{question ≤400 chars, context ≤8 scalars}`); the sentence on the chip *is* the question (never stored separately). Answers on-screen via `textContent` only; top status pod has four states (Stargazer / Star-map linked / Advisor away / Star-map unstable); failures resolve into the player-facing sentence via the `reason` enum (all-disabled / timeout / network / bad-JSON / empty-question / cancelled / HTTP-refused / catch-all).

Topology:

`AdvisorPanel → OnlineServices (off by default; real AbortController cancel) → Gateway /api/ai/** (lb://ai-service, order=-1, aiServiceBreaker) → ai-service (:8083) → wkapi.pro/v1`

Ops notes:

- The key is injected **into this one JVM only** (`LLM_API_KEY`); the config server’s `ai-service.yml` deliberately omits it (repos are read by many people and refresh-pushed); `env.example` carries placeholders only; `.env` is gitignored; the key never lands in files.
- **The POST route has no gateway-level Retry**; `forward:/fallback/advisor` catches downstream-down / breaker-open (both GET and POST mapped; returns 503 advisor-unavailable, not 405).
- The frontend never client-retries (the stop button aborts the real request via AbortController — not “cancel” by greying out a button).
- **ai-service self-healing**: identical question hits the SHA-256 cache within 120s (cache misses automatically on model / system change); breaker OPEN 30s, then single half-open probe; `/api/ai/health` reports `configured/model/circuit/cache/upstreamCalls` — a strict allowlist, never echoing key or upstream base URL.
- The **Echo-Lamp** (`POST /api/ai/echo-hint`) shares the same digest→cache→breaker→selective-retry→parse pipeline — only its system prompt differs.
- Live verification: `mvn -o -pl ai-service -am package -DskipTests` then `powershell -File .\scripts\verify-ai-service.ps1` (with `LLM_API_KEY` it really hits chat + echo-hint and asserts non-empty answers; without a key it asserts the structured 503 degradation path, zero outbound calls).

## Lore Oracle — the canon-answer lane (W-Z82, retrieval-augmented generation)

Player entry: **the pill “典籍 / Lore” in the Star-Rail Advisor panel** (always above the input, gold-violet glow = on). With it on, *the same input box* no longer goes to the advisor loop but to `/api/ai/lore/answer` — the server picks the most relevant canon excerpts with BM25, ships them to the big model together with a “keeper of the chronicles” system prompt, and the answer may only cite what the corpus contains, inline as `[path]`. Flip it off and you’re back to the everyday advisor.

Topology:

`AdvisorPanel (loreMode) → OnlineServices.askOracle → Gateway /api/ai/lore/** (lb://ai-service) → ai-service (:8083) → BM25 → wkapi.pro/v1`

Contract:

- **`POST /api/ai/lore/answer`** — body `{ question ≤ 400 chars, limit? = 0|1..6 }`, default 4 → `{ ok, answer, sources: [path…], model, cached, upstreamCached, latencyMs, requestId? }`. If no BM25 hit exists, the model is **not** called; the service returns `「此物未在典籍中 · This is not in the record.」` (`model: "oracle-bm25"`) — not a shrug, the canon simply doesn’t have it.
- **`GET /api/ai/lore/health`** → `{ ready: true, candidates, bm25Probe }`; never echoes corpus text.
- Corpus = deterministically compiled by `scripts/build-lore-corpus.mjs` from `creative/novel/*.md` (12 chapters) + `creative/novel/en/*.md` (full English translation) + `creative/GLOSSARY.md` + `creative/GLOSSARY-en.md` + `creative/film/*.md` (the 142-minute screenplay in both languages + the short film) + `creative/music/liner-notes.md/.en.md` + `creative/music/OST-专辑手册.md/.en.md` into `classpath:/lore/corpus.txt` (~300 KB UTF-8, 34 sources, 1866 retrieval blocks); `--check` validates anywhere with read-only CI.
- Tokenization: one token per Han codepoint + lowercase ASCII alphanumeric runs (`Bm25Tokenizer`); scoring: standard BM25 (k1=1.5, b=0.75); the fixed system prompt + fixed excerpt set means identical questions hit the digest cache.
- System prompt hard rules: answer in the language the player asked; every claim carries an inline `[bracket]` citation; unknown characters/locations/items ⇒ the exact “not in the record” line — no invention.
- **W-Z84 two-stage retrieval (multi-hop RAG)**: the primary pass ranks with BM25(question) and keeps its order; a second pass splits compound questions on CJK/ASCII punctuation ([？?。；;，,！!] + 「并且/而且/以及/还有」 + literal `and|with|plus`) into ≤3 clauses and searches each separately, appending up to 2 previously unseen blocks per clause (capped at `min(limit+2, 6)` total). The enrichment complements the two semantics pooled into one long sentence ("Why didn't the fire go out? Who is Lin Du?"). `ai-service.lore.multihop=false` restores the single-pass behavior (`lore.limit` in `application.yml` is tunable). Zero extra LLM calls, no locks, deterministic.
- Frontend accounting keeps the advisor-panel conventions: `cached=true` ⇒ local-digest hit (excluded from upstream totals); `upstreamCached=true` ⇒ gold “upstream cache” badge; failures collapse into the shared eight-sentence `ADVISOR_REASONS` taxonomy (reason=`http` + status=503 renders “breaker circuit open”, *not* “gateway unreachable”).

Ops notes:

- **No gateway change at all**: `/api/ai/lore/**` is covered by the existing `Path=/api/ai,/api/ai/**` predicate; POST carries no Retry (same reasoning — a lore question must never be double-billed).
- This path **does not enter Redis Streams** (stateless read, no game state pulled): triage is `/api/ai/lore/health` + the access log, full stop.
- Two ways to verify: browser DevTools with the online switch on → open the advisor panel → tap “Lore” → ask “林渡为什么没熄火？” and expect a chapter-07 citation; or server-side `mvn -o -pl ai-service test -Dtest=OracleControllerTest`.

## Async advisor queue & ops surfaces (W-Y4 / W-Z1 / W-Z7 / W-Z8 / W-Z9)

- **Async queue (W-Y4)**: `POST /api/ai/chat/async` (202; `{jobId, status:"queued", duplicate, pollAfterMs}`) — capacity exhaustion is **`429` + `Retry-After`** (explicit backpressure, not a polite “try again later”). Slow LLM is isolated from Tomcat worker threads; 2 workers, bounded inbox (64); exponential backoff ≤3 only for `upstream-*` / `circuit-open`; exhausted ⇒ DLQ (`ai:advisor:dlq`). `requestId` idempotent (body shadows gateway `X-Request-Id` — client owns the idempotency key). **Redis Streams backend** (`ai-service.jobs.backend=redis`) — cross-instance at-least-once (consumer group + XPENDING redelivery); missing Redis → fail-open back to the in-memory backend. Polling `GET /api/ai/jobs/{id}` (question/context never echoed); stats at `GET /api/ai/jobs/stats` (capacity/depth/pending/workers/inFlight/enqueued/rejected/dedupHits/done/deadLettered/cancelled).
- **Real cancel (W-Z7 A)**: `POST /api/ai/jobs/{id}/cancel` — queued ⇒ tombstoned CANCELLED + removed from inbox/stream; the upstream call never happens. Running/terminal ⇒ 200 + `cancelled:false` + `reason:already-running|already-terminal` (honest — never lies about what was recalled). Unknown ⇒ 404. Cancel also releases the idempotency key (`requestIds.remove` / `DEL dedup:<key>`) — re-asking with the same requestId starts the acceptance flow fresh.
- **Dead-letter read-only whitelist (W-Z1 #2)**: `GET /api/ai/jobs/dead-letter?limit=N` (default 10, cap 50) → `{items:[{id, requestId?, reason, attempts}], count, limit}` — **question / answer / context never leave the process**: a single player’s input does not belong in ops lists; what triage needs is “how many times did this failure class happen”.
- **Advisor aggregate ops tile (`/api/ops/advisor`, W-Z8)**: game-service Feign (`AiServiceClient`) reads ai-service’s `/health` + `/jobs/stats` (each 30s TTL-cached, empty Map ⇒ `available:false`, `reason:fallback`, local try/catch on top — ops views never 500). Kept **out of `/api/ops/stats`** deliberately: stats is per-instance zero-outbound memory data; advisor must not inherit outbound failure modes (same precedent as `/api/ops/season`). Frontend: settings-panel “Star-Rail diagnostic” button (W-Z8 #2) fetches on-demand and renders one line of model/circuit/calls + depth/inFlight/rejected/deadLettered; all rows `textContent` end-to-end.
- **Structured access log (W-Z9)**: one JSON line per request per service (`{ts, app, requestId, method, path (no query/body), status, durationMs}`); `/actuator` unlogged; `X-Request-Id` echoed as received.
- **Frontend async path (W-Z7 B)**: askAdvisorBackground — submit → poll on AbortSignal ticks (zero bare timers) until terminal state; “Stop” = disconnect poll + `POST cancel` to recall queued jobs (a running LLM call cannot be recalled; the server honestly reports `already-running`); DEAD merges into the “503 + advisor-unavailable” cell; 429 ⇒ busy; 3 consecutive poll failures ⇒ NETWORK.
- **Smoke**: §4k (queue backpressure) / §4l (X-Request-Id propagation) / §4m (`/api/ops/advisor`) / §4n (cancel contract) / §4o (dead-letter whitelist carries no player input) / §4p (`/api/ops/dead-letter` superset + reason histogram).
- **Redis-backed advisor queue gate (`verify-redis-advisor-queue.ps1`)**: throwaway `redis:7-alpine` + ai-service with `AI_SERVICE_JOBS_BACKEND=redis`; without `LLM_API_KEY` the worker deterministically turns not-configured into DEAD; asserts submit→claim→DEAD→DLQ→dead-letter whitelist endpoint and that `ai:advisor:jobs` / `ai:advisor:dlq` stream keys really exist (proves the Redis path, not memory). Runs on every `server/**` push.
- **Prometheus exposition gates**: `verify-prometheus.ps1` scrapes game-service `/actuator/prometheus` (`game_telemetry_enqueued_total` / `_dropped_total` / `_processed_total`, JVM + process_uptime). `verify-prometheus-ai.ps1` does the same on ai-service with one real advisor chat in between; new CI gate `AI service Prometheus metrics`. `verify-redis-leaderboard.ps1` proves the leaderboard mirror (ZCARD=3, restarts keep top-K). `verify-redis-trial.ps1` proves the trial mirror. `verify-redis-rate-limit.ps1` proves the Redis rate limiter (burst of 70 ⇒ 429). `verify-redis-season-cache.ps1` proves the season cache (two identical `/api/seasons/active` calls + TTL≈300s).
- **`/api/ops/redis` (W-Z13)**: read-only JSON — backend flags of both mirrors (leaderboard:runs / trial-leaderboard:runs), whether mirrors are wired, ZCARD (−1 on error), seedDemoData, maxLimit. Pure read rails; no names/scores/keys. smoke §4q asserts (200 + whitelist fields + no secrets).
- **gateway Micrometer/Prometheus (W-Z14)**: Spring Cloud Gateway also exposes `/actuator/prometheus`. `GatewayMetricsFilter` (GlobalFilter order=100): `gateway_requests_total{route, outcome}` (route ∈ {version, ai, seasons, leaderboard, trials, telemetry, ops, other}; outcome ∈ {2xx, 4xx, 5xx, other} — finite enums, no player-input labels) + `gateway_request_duration_seconds` (histogram, SLO ≤120s). smoke §4r asserts; three GatewayMetricsFilterTest cases pin the enum lists.
- **echo-qa / ach-qa streaming QA scripts (W-Z11)**: call with `stream:true` + `include_usage`, print per-batch + grand-total `prompt/completion/cached/cachedRatio`; default batch=10, one auto-retry round on parse failures; `max_tokens: 1536`. Every call from CI/local/prod now routes through wkapi as “streaming”.
- **Redis-backed leaderboard mirror (W-Y5)**: throwaway redis + game-service (`backend=redis`, `seed-demo-data=false`) → three submissions → `ZCARD=3` → top-K survives restart. Default `backend=memory` path: zero change.
- **Redis-backed trial mirror (W-Y6 #3)**: same shape — three trial runs (ember ×2 + gloom ×1) → ZSET evidence → after restart the season filter still puts `amber-spirit` on top. Both report into smoke §4q.

## Deployment

```powershell
cd server
mvn -B verify                 # produce all module jars
docker compose build           # images built from verify output; zero network at build time
docker compose up -d           # boot with health-check ordering
docker compose run --rm verify # one-shot curl triple-check
docker compose down
```

> Reality check: on the dev machine that hosts this repo, the Docker daemon is held by another active project, so the full image build + stack boot was never finished locally. `docker compose config` validates; and CI (`.github/workflows/server.yml`, Temurin 21 + `pwsh`) runs `mvn verify` + the full `smoke.ps1` on every `server/**` change — that is the authoritative assembly check.

## Environment variable quick reference

| Variable | Purpose | Local default |
|---|---|---|
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` | Registry URL | `http://localhost:8761/eureka/` |
| `EUREKA_INSTANCE_HOSTNAME` | Registration name (use `localhost` for local joint debugging) | machine hostname |
| `EUREKA_INSTANCE_PREFERIPADDRESS` | Register by IP instead of name | `false` |
| `SPRING_CONFIG_IMPORT` | Pull config from the config server — **only for game-service / season-service**; never for config-server itself | `optional:configserver:http://localhost:8888` |
| `SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS` | Config repo location for the native profile (smoke uses it to redirect config-server at a temp dir) | `classpath:/config` |
| `CROSSREALM_ONLINE_BASE_URL` (frontend: `crossrealm_online_base_url`) | Frontend gateway address | same origin |
| `LLM_API_KEY` | **ai-service exclusive** upstream LLM key (never config server / image / logs / body) | (empty ⇒ ai-service boots unconfigured; `/api/ai/health.configured=false`) |
| `LLM_BASE_URL` | OpenAI-compatible upstream | `https://wkapi.pro/v1` |
| `LLM_MODEL` | Model id (`gpt-6-sol` etc. under `/v1/models`) | `gpt-6-sol` |

## Known pitfalls (all previously stepped on; see also `server/README.md` & ADRs)

- `SPRING_CONFIG_IMPORT` is JVM-scoped: handing it to config-server makes it pull from itself — HTTP worker threads saturate, **health checks fake-dead** (classic zero-log symptom).
- Loopback connections to an **unstarted** local port take ~2–4s to RST (looks like a filtered-loopback driver); health polling `-TimeoutSec` must be ≥ 25s.
- Registering with a LAN/`host.docker.internal` name breaks gateway `lb://` resolution — must use `EUREKA_INSTANCE_HOSTNAME=localhost` + `PREFERIPADDRESS=false`.
- Cold-start **30-second-class** registry-cache warm-up on `lb://` (eureka refresh threshold): just after boot, the first bursts **miss (503)** — expected. Smoke and `verify-breaker.ps1` both poll-to-200 before asserting.
- The gateway breaker (W-X5) only catches **route-chain exceptions** (e.g. stale instances in the eureka cache). Empty 503 from a no-instance LB short-circuit bypasses the breaker — both are 503, only body shapes differ.
- **`GET /api/version` uses a dedicated priority route (order=-1) with a Retry filter** — cold start / one 502 no longer bounces edge clients. The main route deliberately has no Retry (no POST double-writes).
- **Reactive breaker’s default `TimeLimiter` is 1 second** (not the “no timeout” behavior people expect of Resilience4j). LLM calls typically take 2–30s — the default classifies every POST as timed-out and falls back. The gateway `aiServiceBreaker` explicitly sets `timeout-duration: 75s` (ai-service’s own 20s + two retries + jitter); `game` / `season` / `version` keep the millisecond default (which is correct for their sub-10ms endpoints).
- **`@Service` with multiple constructors must declare `@Autowired` explicitly**: without it Spring falls back to the default constructor — missing ⇒ whole context fails to boot, mocked unit tests stay green, the real jar never starts (hit 2026-11-12: ai-service literally never booted). Regression caught by `AiServiceApplicationContextTest` (real context boot).
- **smoke ships without `LLM_API_KEY` by default**: six services come up + `lb://` routing + `/api/ai/health` assertions hold in CI always; the real echo-hint round-trip only happens when the env carries the key (never a file).
- **W-X12 IP rate limit** (`RateLimitByIpFilter`): same IP ≤60 requests in 10s; overflow ⇒ 429 + JSON.
- Spring Cloud Gateway 4.x route config prefix is `spring.cloud.gateway.server.webflux.*` (legacy `spring.cloud.gateway.routes` only logs a migration warning).

## File index

- `server/` — Maven multi-module + `scripts/` (`smoke.ps1`, `verify-breaker.ps1`) + `docker-compose.yml`
- `src/online/leaderboardFormat.js` — online leaderboard entry formatter (pure functions, W-X7)
- `server/scripts/verify-breaker.ps1` — W-X5 gateway-breaker diagnostic (manual)
- `.github/workflows/server.yml` — CI (build + unit + full-stack smoke)
- `src/online/OnlineServices.js` — game-side client (default off)
- `server/season-service/` — season service (roster / cycle rotation / affix contract)
- `server/ai-service/` — Star-Rail Advisor / Echo-Lamp (only key holder; `verify-ai-service.ps1` live call)
- `server/notification-service/` — Fireside Herald (W-Z49; `verify-notify-redis.ps1` cross-instance ledger)
- `src/online/OnlineServices.js` exports `askAdvisor / fetchAdvisorHealth / fetchEchoHint` — ask/health/hint client outlets (default off, AbortController hard-cancel)
- `src/ui/AdvisorPanel.js` + `src/content/advisor.js` — panel & client contract (one wire protocol: reason enum / length caps / suggestion roster)
- `docs/MASTER_PLAN.md` — §9 ADR log: W-X1..W-X18, W-P1..W-P13, W-S1, W-Y4..W-Z9 (gateway, config, advisor, telemetry, retrospectives).
