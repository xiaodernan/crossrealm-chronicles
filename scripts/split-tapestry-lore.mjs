#!/usr/bin/env node
/**
 * split-tapestry-lore — one-time restructure (W-Z89):
 * creative/tapestry-lore.md  (one 20 KB doc)  →  creative/tapestry-lore/NN-slug.md  ×17
 *
 * Two deliverables for each mother:
 *   md text = the mother's block only (heading + lamp喻/EN + epitaph + anchor id)
 *   filename keyed to a short stable slug for BM25 to cite
 * The aggregate single-page version is REMOVED — the canon should have one home, not two.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'creative/tapestry-lore.md';
const DIR = 'creative/tapestry-lore';

const raw = readFileSync(SRC, 'utf8');
const blocks = raw.split(/\n(?=## )/).filter((b) => b.trim().startsWith('##'));
if (blocks.length !== 17) {
  console.error(`expected 17 blocks, found ${blocks.length} — refusing`);
  process.exit(1);
}
const SLUGS = {
  '01': 'academy-of-magic', '02': 'starward-crossing', '03': 'the-upside', '04': 'border-old-days',
  '05': 'underworld-triad', '06': 'deepspace-age', '07': 'cyber-neon', '08': 'samurai-echoes',
  '09': 'whispers-of-the-old-days', '10': 'starport-routes', '11': 'gloom-echoes', '12': 'radiant-echoes',
  '13': 'voidmaw-echoes', '14': 'abyssal-salt-song', '15': 'middle-earth', '16': 'homecoming',
  '17': 'crossover',
};
mkdirSync(DIR, { recursive: true });
let n = 0;
for (const block of blocks) {
  const heading = block.split('\n', 1)[0].trim();
  const num = heading.match(/^##\s+(\d+)/)[1];
  const slug = SLUGS[num] ?? `mother-${num}`;
  writeFileSync(join(DIR, `${num}-${slug}.md`), block.trim() + '\n', 'utf8');
  n++;
}
rmSync(SRC);
console.log(`split-tapestry-lore: wrote ${n} files under ${DIR}/ and removed ${SRC}`);
