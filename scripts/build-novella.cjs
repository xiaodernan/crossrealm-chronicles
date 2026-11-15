const fs = require('fs');
const path = require('path');

const root = 'D:/3a大作';
const zhDir = path.join(root, 'creative/novel');
const enDir = path.join(root, 'creative/novel/en');

const listFiles = (dir) =>
  fs.readdirSync(dir).filter((f) => /^\d{2}.*\.md$/.test(f)).sort();

const zhFiles = listFiles(zhDir);
const enFiles = listFiles(enDir);
console.log('zh files:', zhFiles.length, 'en files:', enFiles.length);
if (zhFiles.length !== enFiles.length) { console.error('length mismatch'); process.exit(1); }

// Build the two modules
const toEntry = (dir, f, id) => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const titleLine = content.split('\n').find((l) => l.startsWith('# ')) ?? f;
  const title = titleLine.replace(/^#\s*/, '').trim();
  const body = content.trim();
  return { id, title, body };
};

const zhEntries = zhFiles.map((f, i) => toEntry(zhDir, f, String(i).padStart(2, '0')));
const enEntries = enFiles.map((f, i) => toEntry(enDir, f, String(i).padStart(2, '0')));

const writeModule = (outPath, exportName, entries) => {
  const body = entries.map((e) => `  ${JSON.stringify(e.id)}: ${JSON.stringify(e, null, 2).replace(/\n/g, '\n  ')}`).join(',\n');
  const src = `/** 自动生成的内典文本——勿手改。由 scripts/build-novella.cjs 从 creative/novel/*.md 确定性生成。\n * 重新生成：node scripts/build-novella.cjs\n */\nexport const ${exportName} = Object.freeze({\n${body}\n});\n`;
  fs.writeFileSync(outPath, src, 'utf8');
  console.log('wrote', outPath, '--', outPath.split(/[\\/]/).pop(), src.length, 'bytes');
};

fs.mkdirSync(path.join(root, 'src/content/novella'), { recursive: true });
writeModule(path.join(root, 'src/content/novella/zh.js'), 'NOVELLA_ZH', zhEntries);
writeModule(path.join(root, 'src/content/novella/en.js'), 'NOVELLA_EN', enEntries);
