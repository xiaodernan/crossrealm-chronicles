# i18n Onboarding Guide for New Content (W-D2, slice 56)

> English mirror of `docs/I18N_GUIDE.md`. Applies to every **player-visible** string (UI text, toasts, aria-labels, text drawn on canvas) and every **content id with a display name** (bosses / zones / enemies / side-quests / achievements / items / story flags). Developer-facing console / throw / invariant messages stay un-keyed — keying them only makes debugging harder.

## 1 · Adding a player-visible string

1. **Add the key to both locales in one go** — `src/content/strings.zh.js` and `src/content/strings.en.js`, same key, same semantics. Adding only one side = import-time `assertI18nParity()` throws (load self-check in `src/engine/i18n.js`).
2. **Key naming**: lowercase snake_case, `^[a-z][a-z0-9_]*$`, name as “module_purpose”
   (`hud_souls_display_fmt`, `settings_keybind_head_action`).
3. **Keys carrying interpolation must end with `_fmt`** and the template must really contain a `${name}` placeholder (the suffix promises interpolation; if it’s missing, the string can never be filled). Call-site: pass a params object — `t('hud_souls_display_fmt', { souls, level })`.
4. **Plural markers in English** (W-D2 slice 58): count + countable noun → three-part form
   `${param|singular|plural}` — `param === 1` renders e.g. `1 time`, everything else `3 times`.
   Example: `'Trigger story flag ${flag} ${count|time|times} (${have}/${count})'`.
   **Never in the Chinese table** (Chinese uses classifiers, not word-shape changes; the conventions gate pins the zh table to zero markers). Substitute parts must be plain words (no `${` / `}` / `|`); the marker param is named exactly like a regular placeholder. Mass nouns (the soulfire family) take no marker.
5. **Reuse first**: at most two keys per text (one per locale). Check for an existing key with the same meaning before creating a new one.
6. **Placeholder keys must not take the DOM path**: `data-i18n` / `data-i18n-aria` replacement is a **whole `textContent` write with no interpolation** — a `${}`-carrying key pinned there renders the literal `${x}` to the player. Every interpolating key goes through the JS path: `t(key, params)`.
7. **Run the gates** (see §4) when you’re done.

## 2 · Giving new content ids display names (roster pattern)

Display names do **not** live in the content tables — instead you build a **roster**: id → **string key** (not the text itself), resolved at render time by `t()`. Rewording then means touching the two locale tables only; the content table stays byte-identical.

```js
// src/content/<family>Names.js
export const XXX_NAMES = {
  'content-id': 'family_display_name_key',   // id -> string key
};
```

The eight existing roster families (resolved through `src/game/StoryWeaponSkills.js`):

| Family | Roster | Resolver |
|--------|--------|----------|
| Bosses | `content/bossRoster.js` | `bossLabel` |
| Zones | `content/zoneNames.js` | `zoneLabel` |
| Kill types | `content/enemyNames.js` | `enemyLabel` |
| Effects | `content/skillTrees.js` (map) | `effectLabel` |
| Side-quests | `content/sideQuests.js` | `questLabel` |
| Achievements | `content/achievements.js` | `achievementLabel` |
| Items | `content/items.js` | `itemLabel` |
| Story flags | `content/storyFlags.js` | `flagLabel` |

New family onboarding = three steps: roster file → register one table in `src/content/registry.js` → add one line to the `tests/content-i18n-keys.test.js` mapping list (that gate checks every roster key exists non-empty in both locales). **Lookup miss falls back to the raw id** by design — content shipped without a name never crashes, it just prints the id.

## 3 · Runtime semantics (`src/engine/i18n.js`)

- Both tables are resolved once at import time (~354KB total source); **no per-locale lazy loading** — the repo has 1300+ `t()` call sites and they are all synchronous; making them async costs more than it buys.
- A missing key returns `[MISSING: key]` + `console.warn`; **each key warns only once per session** (`t()` sits on frame paths — spam would bury real errors).
- `TABLES` is `Object.freeze`d: language switches go through `setLanguage`; the tables themselves cannot be swapped at runtime.

## 4 · Gate checklist (run these after your change)

| Gate file | What it watches |
|-----------|-----------------|
| `tests/i18n.test.js` | Both tables aligned; key completeness (every key referenced by `t()`/`data-i18n` exists); dead keys may only decrease (~75s — run last) |
| `tests/i18n-conventions.test.js` | Key naming, `_fmt` ↔ `${}` convention, placeholders-never-on-DOM, warn dedup |
| `tests/content-i18n-keys.test.js` | Every key mapped in a roster exists non-empty in both locales |
| `tests/content-registry.test.js` | Registry shape & counts |
| `tests/hud-*-i18n.test.js` / `tests/panel-titles-i18n.test.js` et al. | Panel behaviour — after a language switch the UI really is in that language |

Focused run (do not run the whole suite just for this):

```
node node_modules/vitest/vitest.mjs run tests/i18n-conventions.test.js tests/i18n.test.js
```

## 5 · Common error → symptom map

| Symptom | Cause | Gate that catches it |
|---------|-------|----------------------|
| `[MISSING: xxx]` in UI | Key added to one locale only / typo | i18n.test.js — reference completeness |
| Literal `${count}` in UI | Placeholder key pinned to `data-i18n` | i18n-conventions — leakage leg |
| Blank interpolation slot | `_fmt` template missing the placeholder or scalar passed instead of object | i18n-conventions — `_fmt` leg |
| A cell doesn’t switch language | Cell never went through `t()` / no `data-i18n` | panel behaviour legs |
| New content shows raw id | Roster has no entry (fallback behaviour — not a crash) | content-i18n-keys / resolver legs |
| `skill-lock` references unknown kill type (or `boss`) | `kills.type` not in enemy roster; boss kills don't go through the kills family (they use `bossKills`) | skill-lock-refs legs ②/③ |
