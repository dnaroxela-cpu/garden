// Переносить #теги з тексту нотаток у властивість «tags» (Obsidian properties).
//   node migrate-tags.js          — лише показує, що зміниться (нічого не записує)
//   node migrate-tags.js --write  — записує; змінені нотатки спершу копіюються в ~/garden-tags-backup-<дата>/
// Сховище — те саме, що в build.js (або VAULT=/шлях node migrate-tags.js).
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');

const VAULT = process.env.VAULT || '/Users/dnaroxela/Documents/Obsidian Vault';
const WRITE = process.argv.includes('--write');
// тег, як його розуміє Obsidian: # після початку рядка, пробілу чи дужки; перший символ — не цифра
const TAG_RE = /(^|[\s(])#([\p{L}_][\p{L}\p{N}_\-/]*)/gu;

function mdFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (d.name.startsWith('.')) return [];
    const full = path.join(dir, d.name);
    return d.isDirectory() ? mdFiles(full) : d.name.endsWith('.md') ? [full] : [];
  });
}

const fmTags = fm => {
  const v = fm.tags ?? fm.Tags ?? fm.tag ?? fm.Tag;
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
};

// прибирає #теги з тексту (крім блоків коду й `коду`), повертає новий текст і знайдені теги
function stripTags(body) {
  const found = [];
  let inFence = false;
  const out = [];
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    let changed = false;
    // теги на початку чи в кінці рядка прибираємо; тег посеред речення стає звичайним словом
    // (`inline code` лишаємо як є)
    const next = line.split(/(`[^`]*`)/).map((part, i, parts) => {
      if (i % 2) return part;
      const ms = [...part.matchAll(TAG_RE)];
      if (!ms.length) return part;
      changed = true;
      const gap = (a, b) => /^[\s,;:]*$/.test(part.slice(a, b));
      let lead = 0, trail = ms.length;
      const end = m => m.index + m[0].length;
      if (i === 0) while (lead < ms.length && gap(lead ? end(ms[lead - 1]) : 0, ms[lead].index)) lead++;
      if (i === parts.length - 1) while (trail > lead && gap(end(ms[trail - 1]), trail < ms.length ? ms[trail].index : part.length)) trail--;
      let res = '', pos = 0;
      ms.forEach((m, k) => {
        found.push(m[2]);
        res += part.slice(pos, m.index) + m[1] + (k < lead || k >= trail ? '' : m[2]);
        pos = m.index + m[0].length;
      });
      return res + part.slice(pos);
    }).join('');
    if (!changed) { out.push(line); continue; }
    let tidy = next.replace(/(\S)[ \t]{2,}/g, '$1 ').replace(/[ \t]+$/, '');
    if (!/^\s/.test(line)) tidy = tidy.trimStart();
    if (/^\s*((tags|теги)\s*:?)?\s*$/i.test(tidy)) continue; // рядок був лише з тегів
    out.push(tidy);
  }
  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n'), found };
}

// замінює (або додає) блок tags: у frontmatter, решту властивостей не чіпає
function withTags(raw, tags) {
  const block = 'tags:\n' + tags.map(t => `  - ${t}`).join('\n');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return `---\n${block}\n---\n` + raw;
  const lines = m[1].split(/\r?\n/), kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^tags?\s*:/i.test(lines[i])) { while (i + 1 < lines.length && /^(\s+|\s*-\s)/.test(lines[i + 1])) i++; continue; }
    kept.push(lines[i]);
  }
  const fm = [...kept.filter((l, i) => l.trim() || i < kept.length - 1), block].join('\n');
  return `---\n${fm}\n---${m[2] || '\n'}` + raw.slice(m[0].length);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const BACKUP = path.join(os.homedir(), `garden-tags-backup-${stamp}`);
let count = 0;
for (const file of mdFiles(VAULT)) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = matter(raw);
  const { body, found } = stripTags(parsed.content);
  if (!found.length) continue;
  const have = fmTags(parsed.data);
  const tags = [...new Set([...have, ...found])];
  const head = raw.slice(0, raw.length - parsed.content.length);
  const next = withTags(head + body, tags);
  const rel = path.relative(VAULT, file);
  count++;
  console.log(`${rel}\n   + ${[...new Set(found)].filter(t => !have.includes(t)).join(', ') || '(уже є у властивостях)'}`);
  if (WRITE) {
    const bak = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.writeFileSync(bak, raw);
    fs.writeFileSync(file, next);
  }
}
console.log(count
  ? (WRITE ? `\nГотово: оновлено ${count} нотаток. Копії старих версій — у ${BACKUP}` : `\nЗміниться ${count} нотаток. Щоб записати: node migrate-tags.js --write`)
  : '\nТегів у тексті нотаток не знайдено.');
