import { readFileSync, writeFileSync } from 'node:fs';

const path = 'D:/3a大作/src/ui/HelpManual.js';
let s = readFileSync(path, 'utf8');

// Normalize to LF for processing
s = s.replace(/\r\n/g, '\n');

// Replace the SECTIONS array with i18n key references
const startIdx = s.indexOf('const SECTIONS = mergeHelpSections([');
const endIdx = s.indexOf(']);', startIdx);
if (startIdx < 0 || endIdx < 0) {
  console.error('Could not find SECTIONS boundaries');
  process.exit(1);
}

const newBlock = `const SECTIONS = mergeHelpSections([
  {
    id: 'start',
    title: 'hm_title_start',
    body: 'hm_body_start',
  },
  {
    id: 'combat',
    title: 'hm_title_combat',
    body: 'hm_body_combat',
  },
  {
    id: 'world',
    title: 'hm_title_world',
    body: 'hm_body_world',
  },
  {
    id: 'dungeons',
    title: 'hm_title_dungeons',
    body: 'hm_body_dungeons',
  },
  {
    id: 'bosses',
    title: 'hm_title_bosses',
    body: 'hm_body_bosses',
  },
  {
    id: 'autoplay',
    title: 'hm_title_autoplay',
    body: 'hm_body_autoplay',
  },
  {
    id: 'perf-hud',
    title: 'hm_title_perf_hud',
    body: 'hm_body_perf_hud',
  },
]);`;

s = s.slice(0, startIdx) + newBlock + s.slice(endIdx + 3);

// Add t import
s = s.replace(
  "import { keyText } from '../content/keyHints.js';",
  "import { keyText } from '../content/keyHints.js';\nimport { t } from '../engine/i18n.js';"
);

// Update buildNav to use t()
s = s.replace(
  '(s) => `<button type="button" data-section="${s.id}">${keyText(s.title)}</button>`',
  '(s) => `<button type="button" data-section="${s.id}">${keyText(t(s.title))}</button>`'
);

// Update showSection to use t()
s = s.replace(
  'this.body.innerHTML = `<h3>${keyText(sec.title)}</h3><pre class="help-text">${keyText(sec.body)}</pre>`;',
  'this.body.innerHTML = `<h3>${keyText(t(sec.title))}</h3><pre class="help-text">${keyText(t(sec.body))}</pre>`;'
);

writeFileSync(path, s, 'utf8');
console.log('Done');
