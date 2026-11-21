<!-- admin-llm-analysis · en · generated=2026-11-21T06:52:03.351Z · model=gpt-6.2-sol · script=scripts/admin-llm-analysis.mjs -->
<!-- 上游源: synthetic.json (SYNTHETIC) + simulation.json (headless-Chrome real sessions) + oracle-cache-probe.json + vow/pass-montecarlo.json + oracle-v5-live-probe.json + guide-live-probe.json (MEASURED). -->
<!-- REMINDER: 本文件由 LLM 生成；数字标注与解读以原始 JSON 与炉边盘页内注记为准。 -->
# Situation read
- **Data provenance:** KPI, funnel, retention, feature, prediction, and forecast values are **SYNTHETIC deterministic demo data** (seed `20261117`), not production telemetry. `simulation.json` reflects **MEASURED** headless Chrome observations from 14 sessions on this repo build, not production telemetry. Cache and state-flow probes are **MEASURED** upstream probes via the local Clash proxy; the vow and pass distributions are **MEASURED** full enumerations (27/27), not samples.
- Synthetic KPIs report average DAU of 303 (range 172–543), 442 average sessions, and 580 average session seconds; the funnel starts at 100% and falls to 18.7% at chapter 5 completion and 4.9% at the “炉主徽章” milestone.
- Synthetic retention declines from D1 64% to D3 34.5%, D7 18.6%, and D14 11.2%. The funnel also shows a drop from 84.7% entering the game to 69.3% completing the first-day tutorial and 44.1% clearing the first boss.
- Synthetic feature-use figures show the quick-start/exit page in 96.4% of sessions, the log in 89.7%, the canon library in 73.1%, and the AI advisor in 43.8%.
- The **MEASURED** simulation completed 14/14 sessions with 0 exceptions; 3 bounced, average boot time was 64,928 ms (P95 102,393 ms), and average wander clicks were 4. This is a small repo-build probe, not production behavior.
- The **MEASURED** oracle-v5 probe reported 82,968 prompt tokens, 73,711 cached tokens, an 88.8% warm hit ratio and 4.8% cold hit ratio. The **MEASURED** guide probe returned `lost` on the path `observe → assess → guideLost → guard`; compose cached ratio was 86.4%.

# Trend
The synthetic 14-day DAU forecast falls from 156 on 2026-11-16 to 40 on 2026-11-29, a net decline of 116 (about 74.4%) across the sequence, with a steep downward slope that becomes less pronounced at the end. It signals substantial modeled churn risk within 90 days, but it is a forecast from synthetic demo data, not a measured production trend; the digest does not provide a 90-day forecast or measured churn.

# Optimization backlog (P0→P3)
- [P0] **Add skippable, persistent investigation guidance** — Evidence: synthetic first-day tutorial completion is 69.3%; existing recommendation notes high quick-start panel clicks and proposes an active but skippable “按 E 调查光柱” prompt. | Expected impact: help more new players complete the first-day interaction. | Effort S.
- [P0] **Offer an accessible first-boss recovery path** — Evidence: synthetic first-boss clear rate is 44.1%; existing recommendation identifies exits before the first boss and proposes a flexible “再战即胜” assist. | Expected impact: reduce early exits and improve first-boss completion. | Effort M.
- [P0] **Tighten the opening around the anchor objective** — Evidence: synthetic 3-minute churn is 20.1%; existing recommendation calls for a denser opening around “锚点必须锚定.” | Expected impact: improve early-session engagement and reduce modeled early churn. | Effort M.
- [P1] **Surface chapter-linked canon rewards** — Evidence: synthetic canon read rate is 62.4%; the existing recommendation cites `canonReaders/dau ≈ 0.61` for the completion group and proposes chapter CG/title unlocks. | Expected impact: reinforce canon reading and chapter progression. | Effort M.
- [P1] **Preload example questions in the AI advisor** — Evidence: synthetic advisor use is 43.8% of sessions; existing recommendation says 62% of users who open it ask a question. | Expected impact: make the advisor’s next action clearer and encourage question use. | Effort S.
- [P1] **Use campfires to clarify the next objective** — Evidence: synthetic mainline progression appears in 78.2% of sessions; existing recommendation identifies campfire rest as a common transition and suggests a next-realm destination and goal prompt. | Expected impact: improve orientation and support return to play. | Effort M.
- [P2] **Investigate boot latency before optimizing startup** — Evidence: **MEASURED** simulation boot average is 64,928 ms and P95 is 102,393 ms across 14 completed sessions. | Expected impact: identify and address startup delays if reproduced in broader testing. | Effort M.
- [P2] **Validate guide outcomes across more state flows** — Evidence: the **MEASURED** guide probe had 2 calls and returned `lost` on `observe → assess → guideLost → guard`. | Expected impact: establish whether guidance outcomes vary across states before changing guide behavior. | Effort S.

# Verify before executing
- The digest cannot establish real production DAU, retention, funnel conversion, or churn: these values are **SYNTHETIC**, and no production telemetry is present here. Needed: successful `/api/telemetry/summary-rollup` responses covering the target population and time window, with cohort definitions and event coverage.
- The 14-session Chrome simulation cannot establish representative startup performance, bounce behavior, or user friction. Needed: a larger measured session set across relevant devices, network conditions, and entry paths, with the same metrics captured.
- The two-call measured guide probe cannot establish the frequency or cause of `lost` outcomes. Needed: more measured calls across documented input states and outcomes.

This report was LLM-generated from a frozen digest; the raw files under docs/admin/data/ are the source of truth.
