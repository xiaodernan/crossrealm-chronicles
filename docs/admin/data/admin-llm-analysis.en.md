<!-- admin-llm-analysis · en · generated=2026-11-18T22:28:40.803Z · model=gpt-6.1-terra · script=scripts/admin-llm-analysis.mjs -->
<!-- 上游源: docs/admin/data/synthetic.json (SYNTHETIC) + simulation.json (headless-Chrome real sessions) + oracle-cache-probe.json + vow/pass-montecarlo.json (MEASURED). -->
<!-- REMINDER: 本文件由 LLM 生成；数字标注与解读以原始 JSON 与炉边盘页内注记为准。 -->
# Situation read

- KPI, funnel, retention, forecast, and feature figures are **SYNTHETIC deterministic demo data** with seed `20261117`, not production telemetry. Average DAU is `303`, average sessions are `442`, and average session length is `580` seconds.
- The funnel drops from `100%` arrival to `44.1%` first Boss completion, `18.7%` Chapter 5 completion, and `4.9%` Furnace Lord badge completion.
- Retention declines from `64%` on D1 to `34.5%` on D3, `18.6%` on D7, and `11.2%` on D14; the reported 3-minute churn rate is `20.1%`.
- The simulation is **MEASURED repo-build observation**, not production telemetry: `14/14` headless Chrome sessions completed, with `0` exceptions, `3` bounces, `64,928 ms` average boot time, and `102,393 ms` P95 boot time.
- The upstream cache probe is **MEASURED** through the local Clash proxy: second-call cache results were `97.3%` for canon and `97.5%` for refs under cache key `crossrealm-canon-v1`.
- `vow-montecarlo.json` and `pass-montecarlo.json` are **MEASURED full-enumeration distributions**, covering `27/27` combinations; the top vow result is `windkeeper` at `22.2%`, and the top pass result is `heirkeeper` at `22.2%`.

# Trend

The 14-day DAU forecast falls from `156` on `2026-11-16` to `40` on `2026-11-29`, a decline of `116` across `13` day-to-day intervals, or approximately `-8.9 DAU per day` using the endpoints. This is a clear short-horizon decline signal, and churn risk within 90 days should be treated as material because D14 retention is already `11.2%` and 3-minute churn is `20.1%`; however, this digest does not provide a measured 90-day churn forecast.

# Optimization backlog (P0→P3)

- [P0] **Make the first investigation prompt persistent and skippable** — evidence: `69.3%` complete the first-day tutorial while `30.1%` bounce and `20.1%` churn within three minutes; the digest identifies “press E to investigate the light pillar” as a first-session friction point | expected impact: improve early task comprehension and reduce avoidable first-session exits | effort S.
- [P0] **Add a flexible recovery path before the first Boss win** — evidence: the funnel falls to `44.1%` at first Boss completion, and `3` of `14` measured simulation sessions bounced | expected impact: increase the share of players reaching the first Boss outcome without forcing a single difficulty path | effort M.
- [P0] **Tighten the opening sequence around the anchor objective** — evidence: `20.1%` churn within three minutes, `30.1%` bounce rate, and `64,928 ms` average measured boot time with `102,393 ms` P95 boot time | expected impact: make the first minutes denser and reduce the combined effect of slow startup and unclear early purpose | effort M.
- [P1] **Turn canon completion into explicit chapter rewards** — evidence: canon reading is `62.4%` overall, the top-feature reading path is `73.1%` of sessions, and the digest reports `canonReaders/dau ≈ 0.61` for the completion group | expected impact: connect reading behavior to chapter progression and give players a clear reason to finish each chapter | effort M.
- [P1] **Preload three actionable questions in the AI advisor** — evidence: the advisor is used in `43.8%` of sessions, while the digest reports `62%` of users who open it go on to ask a question | expected impact: reduce uncertainty after opening the advisor and increase useful interaction with the existing feature | effort S.
- [P1] **Use the campfire as a next-objective checkpoint** — evidence: average session length is `580` seconds, mainline progression appears in `78.2%` of sessions, and the digest identifies campfire rest as a shared relay point | expected impact: improve recall of the next destination and objective at a natural transition point | effort M.
- [P2] **Reduce startup blocking before interactive content appears** — evidence: measured repo-build boot time averages `64,928 ms` and reaches `102,393 ms` at P95, while the synthetic funnel records `84.7%` entering the game after arrival | expected impact: shorten time to first interaction and make the opening experience less vulnerable to startup abandonment | effort L.
- [P2] **Add production telemetry readiness checks to the admin KPI path** — evidence: the pages have no backend, production telemetry exists only when `/api/telemetry/summary-rollup` answers, and admin KPIs marked measured are local development measurements | expected impact: prevent synthetic or local measurements from being mistaken for live operational data | effort M.
- [P3] **Protect canon and refs cache behavior with regression probes** — evidence: measured second-call cache results are `97.3%` for canon and `97.5%` for refs using `crossrealm-canon-v1` | expected impact: preserve the observed cache behavior and detect regressions in cache-key or upstream integration handling | effort S.

# Verify before executing

- This digest cannot establish production DAU, production funnel conversion, or production retention because the KPI, funnel, retention, forecast, and feature values are synthetic, and the repo has no production telemetry unless `/api/telemetry/summary-rollup` answers. A production-wide time series with known user and session scope is needed.
- This digest cannot conclude that the forecasted decline continues for 90 days. A longer measured DAU and cohort-retention window, including at least the relevant 90-day scope, is needed.
- The `14` measured browser sessions cannot establish broad performance or usability behavior. More sessions across the supported browsers, devices, network conditions, and representative user paths are needed.
- The cache probe cannot establish production cache reliability or deployment-wide cache behavior. Probes across production regions, cache states, and the deployed upstream path are needed.
