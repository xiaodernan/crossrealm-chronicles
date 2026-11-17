<!-- admin-llm-analysis · en · generated=2026-11-17T08:10:36.541Z · model=gpt-6.1-terra · script=scripts/admin-llm-analysis.mjs -->
<!-- 上游源: docs/admin/data/synthetic.json (SYNTHETIC) + simulation.json (headless-Chrome real sessions) + oracle-cache-probe.json + vow/pass-montecarlo.json (MEASURED). -->
<!-- REMINDER: 本文件由 LLM 生成；数字标注与解读以原始 JSON 与炉边盘页内注记为准。 -->
# Situation read
- The KPI, funnel, retention, prediction, and feature data are **SYNTHETIC deterministic demo data** (seed `20261117`), not production telemetry. The KPI summary reports average DAU `303`, average sessions `442`, and `2,201` total users.
- The synthetic funnel declines from `84.7%` entering the game to `69.3%` completing the first-day tutorial, `44.1%` beating the first boss, and `18.7%` completing chapter 5; `4.9%` earn the final badge.
- Synthetic retention falls from `64%` on day 1 to `34.5%` on day 3, `18.6%` on day 7, and `11.2%` on day 14. The reported 3-minute churn rate is `20.1%`.
- Synthetic feature usage is high for the quick-start/exit page (`96.4%` of sessions), logs (`89.7%`), and the help manual (`68.2%`); the AI advisor is used in `43.8%`.
- **MEASURED** repo-build browser simulation: `14/14` sessions completed with `0` exceptions; `3` bounced, average boot time was `64,928 ms`, and P95 was `102,393 ms`. These are real headless Chrome observations, not production telemetry.
- **MEASURED** local Clash-proxy cache probe reports second-call rates of `97.3%` for canon and `97.5%` for refs. **MEASURED** vow and pass distributions are full enumerations (`27/27`), not samples.

# Trend
The 14-day DAU forecast is **SYNTHETIC**: it falls from `156` on `2026-11-16` to `40` on `2026-11-29`, a net decline of `116` users across the sequence (about `7.7` fewer per day on average across the `13` day-to-day intervals). This indicates modeled decline, not a measured production trend. Churn risk within 90 days should be treated as a concern to investigate, not a verified production projection: synthetic day-14 retention is `11.2%`, and the digest provides no measured 90-day cohort data.

# Optimization backlog (P0→P3)
- [P0] **Add a skippable, persistent first-anchor prompt** — Synthetic funnel completion falls from `69.3%` at the first-day tutorial to `44.1%` at the first boss; quick-start/exit-page use is `96.4%` of sessions. | May help players discover the investigation interaction and progress toward the first boss; impact is unverified. | Effort S.
- [P0] **Test an accessible first-boss assist** — Synthetic funnel completion is `44.1%` at the first boss versus `18.7%` at chapter 5; `20.1%` is the reported synthetic 3-minute churn rate. | Could reduce early progression friction; validate completion and retention effects before rollout. | Effort M.
- [P0] **Tighten the opening sequence and measure early exits** — Synthetic first-day tutorial completion is `69.3%`, with `20.1%` reported churn within 3 minutes. | May improve early engagement; current digest does not isolate which opening moments cause exits. | Effort M.
- [P1] **Prototype chapter-linked canon rewards** — Synthetic canon read rate is `62.4%`; chapter 5 completion is `18.7%`. The digest’s claimed reader/completion association is synthetic, not causal evidence. | Could encourage canon reading and progression; measure both behaviors in a controlled test. | Effort M.
- [P1] **Offer suggested questions in the AI advisor** — Synthetic advisor use is `43.8%` of sessions; the digest recommendation cites `62%` asking a question after opening, but that figure is not separately present in the KPI fields. | May help convert opens into questions; confirm the baseline and track question starts. | Effort S.
- [P1] **Use campfire transitions to show the next objective** — Synthetic main-story progression appears in `78.2%` of sessions. The claim that all players use campfires is not established by a digest metric. | Could clarify next steps for players who reach campfires; measure exposure and subsequent progression. | Effort M.
- [P2] **Investigate startup latency and bounced sessions** — Measured simulation shows `64,928 ms` average boot time, `102,393 ms` P95, and `3` bounced sessions among `14`. | Identify whether startup delays contribute to observed simulation bounces; production impact is unknown. | Effort M.
- [P2] **Validate cache behavior beyond the local proxy probe** — Measured second-call cache rates are `97.3%` for canon and `97.5%` for refs, using cache key `crossrealm-canon-v1`. | Confirm whether cache behavior holds in the intended deployment and across first calls; no production performance impact is established. | Effort S.

# Verify before executing
- The digest cannot establish whether the synthetic DAU forecast or churn estimates reflect production. Needed: production telemetry from `/api/telemetry/summary-rollup`, with the covered dates, cohort definitions, and enough history to compare the forecast against observed DAU and retention.
- The digest cannot establish that any proposed tutorial, boss-assist, canon-reward, or advisor change causes improved outcomes. Needed: instrumented exposure and outcome events, plus a controlled comparison with eligible users and results segmented by relevant cohorts.
- The `14` browser sessions cannot establish typical user startup performance or bounce rates. Needed: a larger, representative sample across supported devices, browsers, and network conditions, with the same definitions for boot time and bounce.
- The local proxy cache probe cannot establish cache behavior in production. Needed: probes against the actual deployment and workload, including first-call behavior and the relevant request scope.

This report was LLM-generated from a frozen digest; the raw files under docs/admin/data/ are the source of truth.
