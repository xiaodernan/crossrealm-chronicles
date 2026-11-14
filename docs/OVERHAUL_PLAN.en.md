# OVERHAUL_PLAN — Executive Summary (English Mirror)

> English short-entry summary of `docs/OVERHAUL_PLAN.md` (Chinese canonical, ~490 KB). Read the Chinese original for the authoritative record; this page tells a new contributor **what shipped, what to look at, and when it may still matter**.

Crossrealm Chronicles went through a full production-quality overhaul cycle (closed 2026-10 through 2026-11). The label `OVERHAUL_PLAN` is preserved for historical completeness; the plan is **completed**, not pending — no slice is scheduled from this file anymore.

If you want a single sentence: **the game went from prototype to full joy-wheel before release, and the loop actually feels like a finished ARPG.**

---

## Five epical arcs, shipped

### 1 · Zone feel & readability (Zone identity — visual, ambient, and silhouette)
Eight zones (Hub · Fantasy · Magic · Space · Void · Abyss · Gloom · Radiant) were interlocked with unique silhouettes, named areas, faction-aligned enemy rosters, music cues, and poster-language side doors. Each zone is now a readable paragraph of intent rather than an arena.

### 2 · Combat clarity & hit VFX cadence
Lock-on target marker tracing, wind-up telegraphs, impact frames in 2-frames-per-swing, parry windows, evasion invincibility frames — tuned until a new player reads their mistakes without UI.

### 3 · The world’s “loop” backbone
Five chapters with real branching (not fake forks), choices that remain meaningful 15 minutes later; Chapter Five transforms quietly as the Anchor wakes across the loop. Every branch is backed by i18n and acceptance state.

### 4 · The Star-Rail Advisor (W-Y1..W-Z65)
A Spring Cloud online-partner service with authoritative keys on the server side:
Advisor (chat + echo-hint) → `/api/ai/chat` → Gateway → ai-service → wkapi.pro (the only process holding the key).

Full circuit (F7 / FAB, panel-only with online switched on), in-flight timeout, abandoned poll auto-resume, idempotency (optional), rate limited at the gateway IP filter.

### 5 · Analytics & determinism (W-Z70..W-Z80)
- **AB-BA ring deadlock found by player-side stress test** (W-Z79 — see `docs/STRESS_RESULTS.md`)
- **Offline-grid consistency checked against live LLM** (novel-qa — 24/24 pieces clean)
- **Performance budget pinned to the two-axis rule** (upper ceiling raised as only an upper bound, floors tied to real CI reads)

---

## What new contributors must know (from the archive)

- **Cut rate.** Do not add more to this doc. It is archive. If you have something, put it in `docs/MASTER_PLAN.md` §9.
- **The game ships at a fixed difficulty**; see `docs/COMBAT_DESIGN.md` (and `COMBAT_DESIGN.en.md`) for current numbers.
- **Tests are live forks of game state**; treat them like a second game instance, not like mocks.
- **The Kitchen Sink test is on the calendar** — the overhaul is the meal; the kitchen table is `npm run test`.

## Reading order for someone new

1. `README.md` (EN mirror: top section)
2. `docs/MASTER_PLAN.md` §6 (current snapshot) → §9 (ADRs)
3. `docs/COMBAT_DESIGN.en.md`
4. `docs/OVERHAUL_PLAN.md` (original Chinese for the full knife-fight — especially for zone language, enemy battlefield locations, finale feel)

## Status snapshot

- **All zones shipped**
- **All five chapters branching (genuine divergence + the finale variants)**
- **The advisor online partner (Redis ZSET leaderboards/trials) proven by CI Redis mirrors (W-Y5/W-Y6, W-Z1, W-Z49)**
- **Stress-tested** on local Windows hardware (28081 port isolation); 43000+ requests at 2151 rps, zero 5xx. See `docs/STRESS_RESULTS.md` and `server/scripts/stress-verify.ps1` for re-runnable gate.

---

*The Chinese `OVERHAUL_PLAN.md` remains the source of truth; this page is the stranger-at-the-door letter.*
