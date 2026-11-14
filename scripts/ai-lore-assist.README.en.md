/**
 * ai-lore-assist — dev-only AI lore candidate generator (NOT in the hot path; not gameplay)
 *
 * Responsibilities:
 *   1. Dev-only pipeline: feed a batch of “Echo / Mother-theme” lore fragments to the model for consistency/epic-tone checks, emit a shortlist for human review;
 *   2. **NOT in CI hot path** — never called from any player-reachable code;
 *   3. Output is human-review material — final cut is an editor’s decision, not the model’s default;
 *   4. Failsafe offline: exit(1) when `LLM_API_KEY` is absent — zero network requests;
 *   5. Key comes only from env (`process.env.*`); never printed to stdout, never committed.
 *
 * Usage:
 *   LLM_API_KEY=sk-xxxx node scripts/ai-lore-assist.mjs [n] [outPath]
 *   LLM_MODEL=gpt-6-sol LLM_BASE_URL=https://wkapi.pro/v1 LLM_API_KEY=sk-xxxx node scripts/ai-lore-assist.mjs 3 candidates.md
 *
 * Structure:
 *   - system prompt (Chinese polish editor + JSON-array constraint) + user prompt (N mother-themes × 40-80-char Echo descriptions);
 *   - 60 s AbortController timeout; non-2xx → exit(1);
 *   - parse failure → print raw output verbatim, no data loss;
 *   - success → markdown to stdout (or `outPath` when supplied).
 */
