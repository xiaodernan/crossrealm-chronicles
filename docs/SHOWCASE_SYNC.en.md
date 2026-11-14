# Crossrealm Chronicles · Showcase Page & Pages Auto-Sync (W-Z68)

> English mirror of `SHOWCASE_SYNC.md`. This repository ships a fully self-contained, bilingual **“Latest Results” showcase** — `creative/showcase.html`.
> It shows the freshest lab scale, test count and chapters, one page, MIT-grade. Meant for the repo owner’s personal showcase.

## What it is

- A single-page HTML (`creative/showcase.html`): nine microservices · 25 OST tracks · the novel (seven chapters + four letters, full Chinese/English) · 110 echoes · 40+ achievements · MIT.
- **zh / en bilingual** (top-right toggle), same source of truth as the game and as the player guide (`creative/player-guide.html`).
- Shares the canon aesthetic with *Crossrealm Chronicles*: the hearth, the mist, E2→A2, “the fire does not go out.”

## How it stays “latest”

The only fields at risk of staleness after each push are test counts / commit lists — acceptable to refresh per push.

The more valuable contract: **your personal showcase at `xiaodernan.github.io` wants its project entry to always land on “the latest results”**. This repo ships `.github/workflows/showcase.yml`:

1. Push to `main` (or manual `workflow_dispatch`) triggers:
   - `npm ci`
   - `npm run build` (a green production build is the newest deployable artifact)
   - Assembly into `_site/`: `index.html` ← showcase · `game/` ← `dist/` (the whole game, playable) · `guide.html` (player booklet) · `tapestry.html` (the compendium) · `favicon.svg`
   - Publishes to this repo’s `gh-pages` branch
2. Settings → Pages → Source = branch `gh-pages`, root `/` — and
   `https://xiaodernan.github.io/crossrealm-chronicles/` is always the freshest publishable state: playable, readable, linkable.
3. Once enabled, every push to `main` refreshes the Pages cache. **Nothing to manually edit per release.**

## Your one-time action (~30 seconds)

1. Open this repo → **Settings → Pages** (admin rights required)
2. Source: **Deploy from a branch** → Branch: **`gh-pages`** / **`/ (root)`** → Save
3. Visit `https://xiaodernan.github.io/crossrealm-chronicles/` (first deploy takes ~1 minute)
4. Point the project entry on `xiaodernan.github.io` at that URL.

If you don’t enable Pages, the sync still lands on the `gh-pages` branch (browsable on GitHub), and `creative/showcase.html` opens standalone locally — it is a self-contained HTML with zero external dependencies.

## File index

| Purpose | File |
|---------|------|
| Latest Results showcase | `creative/showcase.html` |
| Player booklet / Player Guide | `creative/player-guide.html` |
| The Chronicles Compendium | `creative/tapestry.html` |
| Auto-sync CI | `.github/workflows/showcase.yml` |
| Player save format | `crossrealm_save_v21` (browser localStorage) |
