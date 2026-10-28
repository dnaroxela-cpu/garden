const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// Enable footnotes + custom callout renderer
const CALLOUT_ICONS = {
  note:'✎', warning:'⚠', danger:'⚠', tip:'✦', important:'★',
  quote:'"', info:'ℹ', success:'✓', question:'?', abstract:'≡', example:'⊞'
};

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    blockquote(token) {
      const raw = token.raw || (token.tokens ? token.tokens.map(t => t.raw||'').join('') : '');
      const firstLine = raw.split('\n')[0] || '';
      const calloutMatch = firstLine.match(/>\s*\[!(\w+)\]\s*(.*)/i);
      if (calloutMatch) {
        const type = calloutMatch[1].toLowerCase();
        // FIX 1: no quote icon — just rainbow text title, no symbol before it
        const titleText = calloutMatch[2].trim() || (type.charAt(0).toUpperCase() + type.slice(1));
        const icon = CALLOUT_ICONS[type] || '✎';
        const bodyLines = raw.split('\n').slice(1).map(l => l.replace(/^>\s?/, '')).join('\n').trim();
        const bodyHtml = marked.parse(bodyLines);
        return `<div class="callout callout-${type}"><div class="callout-stripe"></div><div class="callout-inner"><div class="callout-title"><span class="callout-type">${titleText}</span></div><div class="callout-body">${bodyHtml}</div></div></div>\n`;
      }
      const inner = this.parser ? this.parser.parse(token.tokens || []) : (token.text || '');
      return `<blockquote>${inner}</blockquote>\n`;
    }
  }
});

// CONFIG
const VAULT = process.env.VAULT || '/Users/dnaroxela/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault';
const OUT = process.env.OUT || path.join(__dirname, 'docs');

// «tags» property: a YAML list or a "a, b" / "a b" string; a leading # is dropped
function fmTags(fm) {
  const v = fm.tags ?? fm.Tags ?? fm.tag ?? fm.Tag;
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
}

function readFiles(dir, base = dir) {
  const results = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item.startsWith('.') || item === 'private' || item === 'templates') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...readFiles(full, base));
    } else if (item.endsWith('.md')) {
      const rel = path.relative(base, full);
      const raw = fs.readFileSync(full, 'utf8');
      const parsed = matter(raw);
      const frontmatter = parsed.data;
      const author = frontmatter.Author || frontmatter.author || null;
      const year = frontmatter.Year ? String(frontmatter.Year) : (frontmatter.year ? String(frontmatter.year) : null);
      // FIX 3: use frontmatter date if available, fallback to mtime
      const fmDate = frontmatter.date || frontmatter.Date || frontmatter.created || frontmatter.Created || null;
      const bodyOnly = parsed.content;
      // tags: the «tags» property first, then any #tags still left in the text
      const tags = [...new Set([
        ...fmTags(frontmatter),
        ...[...bodyOnly.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "").matchAll(/(?:^|[\s(])#([\p{L}_][\p{L}\p{N}_-]*)/gmu)].map(m => m[1]),
      ].filter(t => t.length > 1))];
      const title = item.replace('.md', '');
      const slug = rel.replace('.md', '').replace(/\s+/g, '-').toLowerCase()
        .replace(/[«»''""]/g, '').replace(/[^a-z0-9а-яА-Я\-\/]/gi, '-').replace(/-+/g, '-');
      const folder = path.dirname(rel) === '.' ? null : path.dirname(rel);
      const mtime = stat.mtime;
      // Format date
      let dateObj = mtime;
      if (fmDate) {
        const parsed = new Date(fmDate);
        if (!isNaN(parsed)) dateObj = parsed;
      }
      const dateStr = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
      const dateShort = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
      const words = raw.replace(/#+\s/g, '').split(/\s+/).length;
      const readTime = Math.max(1, Math.round(words / 200));
      results.push({ title, slug, raw, body: bodyOnly, tags, folder, dateStr, dateShort, dateMs: dateObj.getTime(), readTime, rel, full, author, year, fm: frontmatter });
    }
  }
  return results;
}

function renderTree(files) {
  const folders = {};
  for (const f of files) {
    if (!f.folder) continue;
    const top = f.folder.split(path.sep)[0];
    if (!folders[top]) folders[top] = [];
    folders[top].push(f);
  }
  let html = '';
  for (const [folder, ffiles] of Object.entries(folders)) {
    const folderId = folder.replace(/\s+/g, '-').toLowerCase();
    html += `<div class="folder" onclick="toggleFolder('${folderId}')">
      <span class="folder-arrow" id="arr-${folderId}">▾</span>${folder}
    </div>
    <div class="subfolder" id="${folderId}">`;
    const subfolders = {};
    for (const f of ffiles) {
      const parts = f.folder.split(path.sep);
      const sub = parts[1] || null;
      if (sub) {
        if (!subfolders[sub]) subfolders[sub] = [];
        subfolders[sub].push(f);
      }
    }
    for (const [sub, sfiles] of Object.entries(subfolders)) {
      const subId = sub.replace(/\s+/g, '-').toLowerCase();
      html += `<div class="folder" style="font-size:12px;font-weight:400" onclick="toggleFolder('${subId}')">
        <span class="folder-arrow" id="arr-${subId}">▾</span>${sub}
      </div>
      <div class="subfolder" id="${subId}">`;
      for (const f of sfiles) {
        html += `<a class="note-link" href="${path.basename(f.slug)}.html">${f.title}</a>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderTags(tags) {
  if (!tags.length) return '';
  return `<div class="tags">${tags.map(t => `<a class="tag" href="tag-${t}.html" target="_blank">#${t}</a>`).join('')}</div>`;
}

const SECTION_PAGES = {
  'Research Topics': 'index.html',
  'Book Reviews': 'books.html',
  'Blog Notes': 'blog.html',
  'Seeds': 'seeds.html',
};
// display labels shown to visitors — separate from the real vault folder names above,
// so renaming a label here never requires renaming the actual Obsidian folder
const SECTION_LABELS = {
  'Research Topics': 'Map of Inquiry',
  'Book Reviews': 'Book Reviews',
  'Blog Notes': 'Blog Notes',
  'Seeds': 'Seeds',
};

function renderBreadcrumbs(file) {
  if (!file.folder) return '';
  const parts = file.folder.split(path.sep);
  let html = `<nav class="breadcrumbs"><a href="index.html">Home</a>`;
  for (const part of parts) {
    const href = SECTION_PAGES[part];
    const label = SECTION_LABELS[part] || part;
    html += `<span>›</span>` + (href ? `<a href="${href}">${label}</a>` : `<span>${part}</span>`);
  }
  html += `<span>›</span><span class="bc-current">${file.title}</span></nav>`;
  return html;
}

function buildGraphData(files) {
  const noteNodes = files.filter(f => f.folder).map(f => {
    const clean = f.raw
      .replace(/^---[\s\S]*?---/, '')
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/(?<![#\n]) *#([a-zA-Zа-яА-Я]\w*)/g, '')
      .replace(/[#*`_\[\]]/g, '')
      .replace(/\s+/g, ' ').trim();
    const firstSentence = clean.split(/[.!?]\s+/)[0]?.trim().slice(0, 120) || '';
    return {
      id: path.basename(f.slug),
      title: f.title,
      folder: f.folder ? f.folder.split(path.sep)[0] : null,
      tags: f.tags.slice(0, 4),
      excerpt: firstSentence,
      date: f.dateMs,
      isTag: false
    };
  });
  const allTags = [...new Set(files.flatMap(f => f.tags))];
  const tagNodes = allTags.map(tag => {
    const taggedFiles = files.filter(f => f.tags.includes(tag));
    return {
      id: 'tag-' + tag,
      title: tag,
      folder: null,
      tags: [],
      count: taggedFiles.length,
      excerpt: taggedFiles.map(f => f.title).slice(0, 3).join(', '),
      date: Math.min(...taggedFiles.map(f => f.dateMs)),
      isTag: true,
      tag: tag
    };
  });
  const tagEdges = [];
  noteNodes.forEach(n => {
    n.tags.forEach(tag => {
      tagEdges.push({ from: n.id, to: 'tag-' + tag });
    });
  });
  return JSON.stringify({ nodes: [...noteNodes, ...tagNodes], tagEdges });
}

function template({ title, content, isIndex, isResearch, isBlog, isSeeds, file, treeHtml, allFiles, heroImg, heroImgDark, sidebarExtra, hasFootnotes }) {
  const isActive = (page) => {
    if (page === 'home' && isIndex) return 'active';
    if (page === 'research' && (isResearch || (file && file.folder && file.folder.startsWith('Research Topics')))) return 'active';
    if (page === 'books' && (title === 'Book Reviews' || (file && file.folder && file.folder.startsWith('Book Reviews')))) return 'active';
    if (page === 'blog' && (isBlog || (file && file.folder && file.folder.startsWith('Blog Notes')))) return 'active';
    if (page === 'seeds' && (isSeeds || title === 'Seeds' || (file && file.folder && file.folder.startsWith('Seeds')))) return 'active';
    return '';
  };

  const showTree = false;
  const heroClass = heroImg ? ' hero-page' : '';
  const heroCss = heroImg ? `
html.hero-page, body.hero-page { background:transparent; }
html[data-theme="light"] body.hero-page::before { content:''; position:fixed; inset:0; z-index:-2; background-image:url('${heroImg}'); background-size:cover; background-position:center; }
html[data-theme="dark"] body.hero-page::before { content:''; position:fixed; inset:0; z-index:-2; background-image:url('${heroImgDark || heroImg}'); background-size:cover; background-position:center; }
body.hero-page::after { content:''; position:fixed; inset:0; z-index:-1; background:linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.12) 40%, rgba(0,0,0,.4) 100%); }
body.hero-page .sidebar { background:transparent; }
body.hero-page .mobile-topbar { background:transparent; border-bottom:1px solid rgba(255,255,255,.12); }
body.hero-page .content, body.hero-page .content h1.article-title, body.hero-page .content .meta,
body.hero-page .article-body, body.hero-page .article-body p, body.hero-page .article-body li,
body.hero-page .article-body h1, body.hero-page .article-body h2, body.hero-page .article-body h3,
body.hero-page .article-body h4, body.hero-page .article-body h5, body.hero-page .article-body h6,
body.hero-page .nav-item:not(.active), body.hero-page .icon-btn, body.hero-page .breadcrumbs, body.hero-page .breadcrumbs span, body.hero-page .menu-toggle { color:#fff; -webkit-text-fill-color:#fff; }
body.hero-page .icon-btn svg, body.hero-page .menu-toggle svg { stroke:#fff; }
body.hero-page .breadcrumbs a { color:rgba(255,255,255,.75); -webkit-text-fill-color:rgba(255,255,255,.75); }
body.hero-page .article-body a { color:#fff; -webkit-text-fill-color:#fff; background:none; text-decoration:underline; }
body.hero-page .article-body a::after { display:none; }
body.hero-page .content { padding:20px 24px 40px; max-width:none; }
body.hero-page .quote-text { color:#fff; }
body.hero-page .quote-source { color:rgba(255,255,255,.75); }
body.hero-page .quote-refresh { border-color:rgba(255,255,255,.3); color:#fff; }
body.hero-page .quote-refresh:hover { border-color:rgba(255,255,255,.75); }
` : '';

  return `<!DOCTYPE html>
<html lang="uk" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Sasha's Garden</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root[data-theme="dark"] { --bg:#0e0e0e; --bg2:#181818; --border:#262626; --text-muted:#555; --text:#999; --text-strong:#fff; }
:root[data-theme="light"] { --bg:#f5f5f0; --bg2:#e8e8e0; --border:#ddd; --text-muted:#aaa; --text:#555; --text-strong:#111; }
body { font-family:'DM Sans',sans-serif; background:var(--bg); color:var(--text); display:flex; min-height:100vh; transition:background 0.2s; }
.sidebar { width:260px; min-width:260px; padding:36px 28px; display:flex; flex-direction:column; gap:28px; background:var(--bg); position:sticky; top:0; height:100vh; overflow-y:auto; }
.sidebar-top { display:flex; align-items:center; justify-content:space-between; }
.site-title { font-size:18px; font-weight:500; text-decoration:none; background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; }
@keyframes rainbow { 0%{background-position:0%} 100%{background-position:200%} }
.sidebar-icons { display:flex; gap:12px; align-items:center; }
.icon-btn { background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; transition:color 0.15s; }
.icon-btn:hover { color:var(--text-strong); }
.icon-btn svg { width:22px; height:22px; stroke:currentColor; fill:none; stroke-width:1.2; stroke-linecap:round; stroke-linejoin:round; }
nav.main-nav { display:flex; flex-direction:column; gap:4px; }
.nav-item { font-size:15px; color:var(--text); padding:6px 0; display:block; text-decoration:none; border:none; background:none; font-family:'DM Sans',sans-serif; text-align:left; width:100%; -webkit-text-fill-color:var(--text); transition:color 0.15s; cursor:pointer; }
.nav-item:hover { color:var(--text-strong); -webkit-text-fill-color:var(--text-strong); }
.nav-item.active { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; }
.content { flex:1; padding:36px 64px 80px; max-width:800px; }
body.has-notes .content { max-width:1180px; }
.mobile-topbar { display:none; }
.sidebar-scrim { display:none; }
.footnotes-mobile { display:none; }

@media (max-width: 760px){
  body { display:block; }
  .mobile-topbar {
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px; position:sticky; top:0; z-index:60;
    background:var(--bg); border-bottom:0.5px solid var(--border);
  }
  .mobile-topbar .site-title { font-size:17px; }
  .mobile-topbar-icons { display:flex; align-items:center; gap:14px; }
  .mobile-topbar-icons .icon-btn svg { width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.4; stroke-linecap:round; }
  .menu-toggle {
    background:none; border:none; color:var(--text-strong); cursor:pointer;
    display:flex; align-items:center; justify-content:center; padding:4px;
  }
  .menu-toggle svg { width:22px; height:22px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; }
  .sidebar {
    position:fixed; top:0; left:0; height:100vh; z-index:80;
    transform:translateX(-100%); transition:transform .25s ease;
    box-shadow:20px 0 40px rgba(0,0,0,.3);
    width:82vw; max-width:300px;
  }
  body.menu-open .sidebar { transform:translateX(0); }
  body.menu-open .sidebar-scrim {
    display:block; position:fixed; inset:0; z-index:70;
    background:rgba(0,0,0,.45);
  }
  .sidebar-top { display:none; }
  .content { padding:24px 20px 60px; max-width:none !important; }
  .article-grid { grid-template-columns: 1fr !important; column-gap:0; }
  .note-col { display:none; }
  .footnotes-mobile { margin-top:32px; padding-top:20px; border-top:0.5px solid var(--border); display:flex; flex-direction:column; gap:14px; }
  .fn-mobile-item { font-size:14px; line-height:1.6; color:var(--text-muted); }
  .fn-mobile-item p { font-size:14px; line-height:1.6; color:var(--text-muted); margin-bottom:6px; }
  .fn-mobile-num { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; font-weight:500; margin-right:6px; text-decoration:none; cursor:pointer; }
  .covers-grid { grid-template-columns: repeat(2, 1fr) !important; gap:14px !important; }
  .article-body a::after { display:none; }
  .work-arrow { display:none; }
}
.breadcrumbs { font-size:13px; color:var(--text-muted); margin-bottom:20px; display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; }
.breadcrumbs a { color:var(--text-muted); text-decoration:none; transition:color 0.15s; }
.breadcrumbs a:hover { color:var(--text-strong); text-decoration:underline; }
.breadcrumbs span,.bc-current { color:var(--text-muted); }
h1.article-title { font-size:26px; font-weight:500; line-height:1.3; color:var(--text-strong); margin-bottom:8px; }
.meta { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
.tags { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:32px; }
.tag { font-size:14px; background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; text-decoration:none; cursor:pointer; transition:opacity 0.15s; }
.tag:hover { opacity:0.7; }
.article-body .embed-figure { margin:24px 0; }
.article-body .embed-figure img { max-width:100%; border-radius:8px; display:block; }
.article-body .embed-figure video { max-width:100%; border-radius:8px; display:block; background:#000; }
.article-body .embed-figure audio { width:100%; margin:8px 0; }
.article-body img { max-width:100%; border-radius:8px; margin:16px 0; display:block; }
/* Plain blockquote (no [!type]) — just a rainbow line on the left, no box */
.article-body blockquote { position:relative; margin:24px 0; padding:2px 0 2px 18px; }
.article-body blockquote::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:linear-gradient(180deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:100% 300%; animation:rainbow-v 4s linear infinite; border-radius:2px; }
.article-body blockquote p { font-size:16px; line-height:1.75; color:var(--text); margin-bottom:8px; }
.article-body blockquote p:last-child { margin-bottom:0; }
/* Callouts */
.callout { display:flex; gap:0; margin:24px 0; border-radius:0 8px 8px 0; overflow:hidden; }
.callout-stripe { width:2px; flex-shrink:0; background:linear-gradient(180deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:100% 300%; animation:rainbow-v 4s linear infinite; }
@keyframes rainbow-v { 0%{background-position:0% 0%} 100%{background-position:0% 200%} }
.callout-inner { flex:1; background:var(--bg2); border:0.5px solid var(--border); border-left:none; border-radius:0 8px 8px 0; padding:14px 16px; }
.callout-title { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
.callout-type { font-size:13px; font-weight:500; background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:300%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; }
.callout-body p { font-size:14px; line-height:1.6; color:var(--text); margin:0; }
.callout-body p+p { margin-top:8px; }
.callout-body ul,.callout-body ol { padding-left:18px; display:flex; flex-direction:column; gap:6px; }
.callout-body li { font-size:14px; line-height:1.6; color:var(--text); }
/* Footnotes — right-margin notes, connected to their in-text marker with a line */
.article-grid { display:grid; grid-template-columns: 1fr 280px; column-gap:48px; }
.article-grid.no-notes { grid-template-columns: 1fr; }
.note-col { grid-column:2; position:relative; }
.fn-ref { font-size:12px; vertical-align:super; position:relative; top:-2px; color:var(--text-muted); margin:0 1px; cursor:default; }
.fn-ref::before { content:'('; }
.fn-ref::after { content:')'; }
.fn-content { display:none; }
.margin-note { position:absolute; top:0; left:0; right:0; font-size:14px; line-height:1.6; color:var(--text-muted); }
.margin-note p { font-size:14px; line-height:1.6; color:var(--text-muted); margin-bottom:8px; }
.margin-note .fn-num { font-size:12px; vertical-align:super; position:relative; top:-2px; margin-right:2px; color:var(--text-muted); }
.margin-note .fn-num::before { content:'('; }
.margin-note .fn-num::after { content:')'; }
.margin-note .fn-line { position:absolute; top:0.95em; right:100%; width:40px; height:1px; background:var(--border); margin-right:14px; }
.article-body sup { font-size:11px; line-height:0; vertical-align:super; }
.article-body sup a { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; text-decoration:none; }
.article-body sup a::after { display:none !important; }
/* FIX 2: Headings — black/white bold, size hierarchy */
.article-body h1 { font-size:28px; font-weight:700; color:var(--text-strong); margin:40px 0 16px; line-height:1.25; }
.article-body h2 { font-size:22px; font-weight:700; color:var(--text-strong); margin:36px 0 14px; line-height:1.3; }
.article-body h3 { font-size:18px; font-weight:700; color:var(--text-strong); margin:28px 0 10px; line-height:1.35; }
.article-body h4 { font-size:15px; font-weight:700; color:var(--text-strong); margin:20px 0 8px; }
.article-body h5 { font-size:14px; font-weight:700; color:var(--text-strong); margin:16px 0 6px; }
.article-body h6 { font-size:13px; font-weight:700; color:var(--text); margin:14px 0 6px; }
.article-body p { font-size:16px; line-height:1.75; color:var(--text); margin-bottom:14px; }
.article-body ul,.article-body ol { padding-left:20px; margin-bottom:16px; display:flex; flex-direction:column; gap:10px; }
.article-body li { font-size:16px; line-height:1.75; color:var(--text); }
.article-body li strong { color:var(--text-strong); font-weight:500; }
.article-body em { font-style:italic; }
.article-body mark { background:linear-gradient(90deg, #a9c9ff, #2f5fdb, #a9c9ff); background-size:300% 100%; animation:markShift 5s ease-in-out infinite; color:#0a1330; -webkit-text-fill-color:#0a1330; border-radius:0; padding:1px 4px; font-weight:500; }
@keyframes markShift { 0%, 100% { background-position:0% 0%; } 50% { background-position:100% 0%; } }
.article-body a { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; text-decoration:none; transition:opacity 0.15s; }
.article-body a::after { content:'↗'; font-size:0.75em; margin-left:2px; background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.article-body a:hover { opacity:0.7; }
hr.divider { border:none; border-top:1px solid var(--border); margin:40px 0; }
.last-modified { font-size:13px; color:var(--text-muted); }
/* Homepage quote (random pick from "Цитати" note) */
.quote-hero { display:flex; flex-direction:column; align-items:flex-start; text-align:left; width:100%; }
.quote-text { font-family:'DM Sans',sans-serif; font-size:.92rem; font-weight:500; line-height:1.4; color:var(--text-strong); margin-bottom:.6rem; transition:opacity .25s ease; word-break:break-word; }
.quote-text.fade { opacity:0; }
.quote-row { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.quote-source { font-size:.76rem; color:var(--text-muted); }
.quote-refresh { background:none; border:1px solid var(--border); border-radius:20px; padding:4px 12px; color:var(--text); cursor:pointer; font-size:.72rem; font-family:'DM Sans',sans-serif; display:inline-flex; align-items:center; gap:6px; transition:opacity .2s ease, border-color .2s ease, color .2s ease; }
.quote-refresh:hover { color:var(--text-strong); border-color:var(--text-muted); }
.quote-refresh svg { width:12px; height:12px; transition:transform .4s ease; }
.quote-refresh.spin svg { transform:rotate(360deg); }
.books-grid { display:flex; flex-direction:column; gap:16px; margin-top:16px; }
.book-card { padding:16px 20px; border:1px solid var(--border); border-radius:8px; cursor:pointer; transition:border-color 0.15s; text-decoration:none; display:block; }
.book-card:hover { border-color:#9d8cff; }
.book-card h3 { font-size:15px; font-weight:500; color:var(--text-strong); margin-bottom:4px; }
.book-card p { font-size:13px; color:var(--text-muted); }
.covers-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:20px; }
.cover-card { border:1px solid var(--border); border-radius:10px; overflow:hidden; cursor:pointer; transition:border-color 0.15s,transform 0.15s; text-decoration:none; display:flex; flex-direction:column; }
.cover-card:hover { border-color:#7b6cf0; transform:translateY(-2px); }
.book-cover { width:100%; aspect-ratio:2/3; background:var(--bg2); overflow:hidden; position:relative; flex-shrink:0; }
.book-cover img { width:100%; height:100%; object-fit:cover; display:block; }
.book-cover-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding:16px; text-align:center; font-size:13px; font-weight:500; background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.book-info { padding:12px 14px; flex:1; display:flex; flex-direction:column; gap:4px; }
.cover-card h3 { font-size:13px; font-weight:500; color:var(--text-strong); line-height:1.4; margin:0; }
.cover-card p { font-size:12px; color:var(--text-muted); margin:0; }
/* Filter bar — shared for blog/seeds/books */
.filter-bar { display:flex; flex-wrap:wrap; gap:6px; margin:20px 0 4px; align-items:center; }
.filter-btn { background:none; border:1px solid var(--border); border-radius:20px; padding:4px 12px; font-size:13px; color:var(--text-muted); cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
.filter-btn:hover { color:var(--text); border-color:var(--text-muted); }
.filter-btn.active { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; border-color:transparent; color:#fff; -webkit-text-fill-color:#fff; animation:rainbow 4s linear infinite; }
.book-card[hidden],.cover-card[hidden] { display:none !important; }

/* Graph */
.graph-wrap { position:relative; width:100%; height:560px; background:var(--bg); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-top:24px; }
#graph { width:100%; height:100%; display:block; }
.graph-tooltip { position:absolute; background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:13px; color:var(--text); pointer-events:none; opacity:0; transition:opacity .15s; max-width:220px; line-height:1.6; font-family:'DM Sans',sans-serif; }
.graph-tooltip .rb { background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:300%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 3s linear infinite; font-weight:500; }
.graph-ctrls { position:absolute; top:12px; right:12px; display:flex; gap:6px; align-items:center; }
.graph-btn { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:5px 10px; font-size:13px; color:var(--text); cursor:pointer; font-family:'DM Sans',sans-serif; line-height:1; }
.graph-btn:hover { color:var(--text-strong); border-color:var(--text-muted); }
.graph-sep { width:1px; height:18px; background:var(--border); }
.graph-legend { position:absolute; bottom:14px; left:14px; display:flex; flex-direction:column; gap:5px; }
.graph-legend-item { display:flex; align-items:center; gap:7px; font-size:11px; font-family:'DM Sans',sans-serif; color:var(--text-muted); }
.graph-legend-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
/* Internal note link popup (Obsidian/Quartz-style) */
.link-preview { position:fixed; width:340px; max-height:280px; overflow-y:auto; background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:16px 18px; box-shadow:0 12px 32px rgba(0,0,0,.25); opacity:0; transform:translateY(4px); pointer-events:none; transition:opacity .15s ease, transform .15s ease; z-index:200; }
.link-preview.visible { opacity:1; transform:translateY(0); pointer-events:auto; }
.link-preview .lp-close { position:absolute; top:8px; right:8px; z-index:2; background:none; border:none; color:var(--text-muted); font-size:14px; cursor:pointer; line-height:1; padding:6px; border-radius:6px; transition:color 0.15s, background 0.15s; }
.link-preview .lp-close:hover { color:var(--text-strong); background:var(--bg); }
.link-preview .lp-title { font-size:14px; font-weight:500; color:var(--text-strong); margin-bottom:8px; padding-right:20px; position:sticky; top:-16px; z-index:1; background:var(--bg2); padding-top:16px; margin-top:-16px; }
.link-preview .lp-body p { font-size:13px; line-height:1.6; color:var(--text); margin-bottom:10px; }
.link-preview::-webkit-scrollbar { width:6px; }
.link-preview::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
${heroCss}
</style>
</head>
<body class="${heroClass.trim()}${hasFootnotes ? ' has-notes' : ''}">
<div class="mobile-topbar">
  <a class="site-title grad" href="index.html">Sasha's Garden</a>
  <div class="mobile-topbar-icons">
    <button class="icon-btn" onclick="toggleTheme()" aria-label="Тема">
      <svg id="icon-moon-mobile" viewBox="0 0 24 24"><path d="M20 13.5a8.5 8.5 0 1 1-9-9 6 6 0 0 0 9 9z"/></svg>
      <svg id="icon-sun-mobile" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>
    </button>
    <button class="menu-toggle" onclick="toggleMobileMenu()" aria-label="Меню">
      <svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
    </button>
  </div>
</div>
<div class="sidebar-scrim" onclick="toggleMobileMenu()"></div>
<aside class="sidebar">
  <div class="sidebar-top">
    <a class="site-title" href="index.html">Sasha's Garden</a>
    <div class="sidebar-icons">
      <button class="icon-btn" onclick="toggleTheme()">
        <svg id="icon-moon" viewBox="0 0 24 24"><path d="M20 13.5a8.5 8.5 0 1 1-9-9 6 6 0 0 0 9 9z"/></svg>
        <svg id="icon-sun" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>
      </button>
    </div>
  </div>
  <nav class="main-nav">
    <a class="nav-item ${isActive('research')}" href="index.html">Map of Inquiry</a>
    <a class="nav-item ${isActive('books')}" href="books.html">Book Reviews</a>
    <a class="nav-item ${isActive('blog')}" href="blog.html">Blog Notes</a>
    <a class="nav-item ${isActive('seeds')}" href="seeds.html">Seeds</a>
    <button class="nav-item" onclick="goRandom()">Random Note</button>
    <a class="nav-item" href="https://dnaroxela.xyz" target="_blank">Work <span class="work-arrow">↗</span></a>
  </nav>
  ${sidebarExtra || ''}
</aside>

<main class="content">${content}</main>

<script>
(function(){
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = t;
  if (t === 'light') {
    ['icon-moon','icon-sun','icon-moon-mobile','icon-sun-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = id.indexOf('moon') !== -1 ? 'none' : '';
    });
  }
})();
function toggleTheme(){
  const h = document.documentElement;
  const dark = h.dataset.theme === 'dark';
  h.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('theme', dark ? 'light' : 'dark');
  ['icon-moon','icon-moon-mobile'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = dark ? 'none' : ''; });
  ['icon-sun','icon-sun-mobile'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = dark ? '' : 'none'; });
}
function toggleMobileMenu(){document.body.classList.toggle("menu-open");}
function toggleFolder(id){const el=document.getElementById(id),arr=document.getElementById('arr-'+id);if(!el)return;if(el.style.display==='none'){el.style.display='';arr&&arr.classList.remove('closed');}else{el.style.display='none';arr&&arr.classList.add('closed');}}
const current=window.location.pathname.split('/').pop();
document.querySelectorAll('.note-link').forEach(l=>{if(l.getAttribute('href')===current)l.classList.add('active');});
const RANDOM_NOTES = ${JSON.stringify(allFiles ? allFiles.filter(f => f.title !== 'index').map(f => path.basename(f.slug) + '.html') : [])};
function goRandom(){if(!RANDOM_NOTES.length)return;window.location.href=RANDOM_NOTES[Math.floor(Math.random()*RANDOM_NOTES.length)];}

// ---------- footnotes: position each margin note against its in-text marker ----------
(function(){
  const noteCol = document.getElementById('noteCol');
  if (!noteCol) return;
  const grid = document.querySelector('.article-grid');
  const refs = document.querySelectorAll('.fn-ref');
  let lastBottom = -Infinity;
  const GAP = 16;

  function layout(){
    lastBottom = -Infinity;
    noteCol.innerHTML = '';
    refs.forEach(ref => {
      const content = document.getElementById(ref.dataset.fn);
      if (!content) return;
      const note = document.createElement('div');
      note.className = 'margin-note';
      note.innerHTML = '<span class="fn-line"></span><span class="fn-num">' + ref.textContent + '</span>' + content.innerHTML;
      noteCol.appendChild(note);

      const refBox = ref.getBoundingClientRect();
      const gridBox = grid.getBoundingClientRect();
      const refCenter = refBox.top - gridBox.top + refBox.height/2;
      const firstLineHeight = parseFloat(getComputedStyle(note).fontSize) * 1.6;
      let top = refCenter - firstLineHeight/2;
      if (top < lastBottom + GAP) top = lastBottom + GAP;
      note.style.top = top + 'px';
      lastBottom = top + note.offsetHeight;
    });
  }
  layout();
  window.addEventListener('resize', layout);
})();

// ---------- internal note link hover preview ----------
const EXCLUDE_FROM_PREVIEW = new Set(['index.html', 'books.html', 'blog.html', 'seeds.html']);
function isInternalNoteLink(a){
  if (a.target === '_blank') return false;
  const href = a.getAttribute('href');
  if (!href) return false;
  const h = href.toLowerCase();
  if (h.indexOf('//') === 0 || h.indexOf('http://') === 0 || h.indexOf('https://') === 0 || h.indexOf('mailto:') === 0 || h.charAt(0) === '#') return false;
  const clean = href.split('#')[0].split('?')[0];
  if (!clean.endsWith('.html')) return false;
  if (EXCLUDE_FROM_PREVIEW.has(clean) || clean.startsWith('tag-')) return false;
  return true;
}
(function(){
  const cache = {};
  let popup = null, activeHref = null, showTimer = null, hideTimer = null;

  function closePopup(){
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (popup){ popup.remove(); popup = null; activeHref = null; }
  }

  function render(href, data){
    const el = document.createElement('div');
    el.className = 'link-preview';
    el.innerHTML = '<button class="lp-close" aria-label="Закрити">✕</button>'
      + '<div class="lp-title">' + data.title + '</div>'
      + '<div class="lp-body">' + data.body + '</div>';
    document.body.appendChild(el);
    el.querySelector('.lp-close').addEventListener('click', closePopup);
    el.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    el.addEventListener('mouseleave', scheduleHide);
    return el;
  }

  function position(el, anchor){
    const box = anchor.getBoundingClientRect();
    let left = box.left, top = box.bottom + 8;
    if (left + 340 > window.innerWidth - 20) left = window.innerWidth - 360;
    if (top + 280 > window.innerHeight - 20) top = box.top - 288;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function scheduleHide(){
    clearTimeout(showTimer);
    hideTimer = setTimeout(closePopup, 200);
  }

  function show(anchor){
    const href = anchor.getAttribute('href');
    clearTimeout(hideTimer);
    showTimer = setTimeout(() => {
      if (activeHref === href) return;
      closePopup();
      activeHref = href;
      if (cache[href]){
        popup = render(href, cache[href]);
        position(popup, anchor);
        requestAnimationFrame(() => popup && popup.classList.add('visible'));
        return;
      }
      fetch(href).then(r => r.text()).then(html => {
        if (activeHref !== href) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const data = {
          title: doc.querySelector('.article-title')?.textContent || href,
          body: doc.querySelector('.article-body')?.innerHTML || ''
        };
        cache[href] = data;
        popup = render(href, data);
        position(popup, anchor);
        requestAnimationFrame(() => popup && popup.classList.add('visible'));
      }).catch(() => {});
    }, 300);
  }

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!canHover) return; // touch devices: let links navigate normally, no hover preview

  document.addEventListener('mouseover', e => {
    const a = e.target.closest('.article-body a');
    if (!a || !isInternalNoteLink(a)) return;
    show(a);
  });
  document.addEventListener('mouseout', e => {
    const a = e.target.closest('.article-body a');
    if (!a || !isInternalNoteLink(a)) return;
    if (a.getAttribute('href') === activeHref) scheduleHide();
    else clearTimeout(showTimer);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
  document.addEventListener('click', e => {
    if (popup && !popup.contains(e.target) && !e.target.closest('.article-body a')) closePopup();
  });
})();
</script>
</body>
</html>`;
}

function convertWikilinks(raw, files) {
  return raw.replace(/(?<!!)\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, target, _, display) => {
    const rawTarget = target.trim();
    const cleanTarget = rawTarget.split('#')[0].split('^')[0].trim().replace(/\.md$/i, '');
    const displayText = (display || cleanTarget).trim();
    const found = files.find(f => f.title.trim().toLowerCase() === cleanTarget.toLowerCase());
    if (!found) return displayText;
    return `<a href="${path.basename(found.slug)}.html">${displayText}</a>`;
  });
}

function resolveMdLinks(html, files) {
  return html.replace(/<a href="([^"]+\.md)"([^>]*)>/gi, (match, href, rest) => {
    let decoded;
    try { decoded = decodeURIComponent(href); } catch (e) { decoded = href; }
    const base = decoded.split('/').pop().replace(/\.md$/i, '').trim();
    const found = files.find(f => f.title.trim().toLowerCase() === base.toLowerCase());
    if (!found) return match;
    return `<a href="${path.basename(found.slug)}.html"${rest}>`;
  });
}

// Parses real Obsidian footnote syntax:
//   reference style — "text[^label]" inline + "[^label]: definition" block (anywhere in the note,
//     definition can continue on indented following lines)
//   inline style — "text^[definition written directly here]"
// Replaces each with a small in-text marker + a hidden content span the client-side script
// picks up to build the right-margin note. Numbering is sequential by order of appearance,
// regardless of what label was used in the source.
function extractFootnotes(raw, fileKey) {
  const defs = {};
  raw = raw.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.+(?:\n[ \t]+\S.*)*)/gm, (m, label, text) => {
    defs[label] = text.replace(/\n[ \t]+/g, ' ').trim();
    return '';
  });
  let inlineIdx = 0;
  raw = raw.replace(/\^\[([^\]]+)\]/g, (m, text) => {
    inlineIdx++;
    const key = '__inline' + inlineIdx;
    defs[key] = text.trim();
    return '[^' + key + ']';
  });
  let n = 0;
  const footnotes = [];
  raw = raw.replace(/\[\^([^\]\s]+)\]/g, (m, label) => {
    if (!(label in defs)) return m;
    n++;
    const id = 'fn-' + fileKey + '-' + n;
    footnotes.push({ id, html: marked(defs[label]) });
    return `<span class="fn-ref" id="fnref-${id}" data-fn="${id}">${n}</span>`;
  });
  return { raw, footnotes };
}

function findMediaSrc(filename, file) {
  const candidates = [
    path.join(path.dirname(file.full), filename),
    path.join(VAULT, filename),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function convertEmbeds(raw, file) {
  return raw.replace(/!\[\[([^\]]+)\]\]/g, (match, filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const mediaSrc = findMediaSrc(filename, file);
    const mediaDest = path.join(OUT, filename);
    if (mediaSrc && !fs.existsSync(mediaDest)) {
      fs.copyFileSync(mediaSrc, mediaDest);
    }
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) {
      return `\n<figure class="embed-figure"><img src="${filename}" alt="${filename}" loading="lazy"></figure>\n`;
    }
    if (['mp4','webm','mov','m4v'].includes(ext)) {
      return `\n<figure class="embed-figure"><video controls preload="metadata"><source src="${filename}" type="video/${ext === 'mov' ? 'mp4' : ext}"></video></figure>\n`;
    }
    if (['mp3','ogg','wav','m4a'].includes(ext)) {
      return `\n<figure class="embed-figure"><audio controls><source src="${filename}"></audio></figure>\n`;
    }
    const slug = filename.replace('.md','').replace(/\s+/g,'-').toLowerCase();
    return `<a href="${slug}.html">${filename.replace('.md','')}</a>`;
  });
}

const COVERS_CACHE_FILE = path.join(__dirname, 'covers-cache.json');
function loadCoversCache() {
  try { return JSON.parse(fs.readFileSync(COVERS_CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCoversCache(cache) {
  fs.writeFileSync(COVERS_CACHE_FILE, JSON.stringify(cache, null, 2));
}
async function fetchBookCover(title, author) {
  const trySearch = async (t, a) => {
    const params = new URLSearchParams({ limit: '1' });
    params.set('title', t);
    if (a) params.set('author', a);
    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    const data = await res.json();
    const coverId = data.docs?.[0]?.cover_i;
    return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;
  };
  try {
    return await trySearch(title, author) || await trySearch(title, null);
  } catch { return null; }
}
async function resolveCovers(bookFiles) {
  const cache = loadCoversCache();
  const toFetch = bookFiles.filter(f => !(f.title in cache));
  if (toFetch.length) {
    console.log(`Завантажую ${toFetch.length} обкладинок...`);
    const results = await Promise.all(toFetch.map(f => fetchBookCover(f.title, f.author)));
    toFetch.forEach((f, i) => { cache[f.title] = results[i]; });
    saveCoversCache(cache);
  }
  return cache;
}

// Helper: build filter bar + card list for blog/seeds
function buildFilteredList(files, idPrefix) {
  const allTags = [...new Set(files.flatMap(f => f.tags))].sort();
  const filterBar = `<div class="filter-bar">
    <button class="filter-btn active" data-value="all" onclick="filterCards(this,'${idPrefix}')">Всі</button>
    ${allTags.map(t => `<button class="filter-btn" data-value="${t}" onclick="filterCards(this,'${idPrefix}')">#${t}</button>`).join('')}
  </div>`;
  const cards = `<div class="books-grid" id="${idPrefix}-grid">
    ${files.map(f => `<a class="book-card" href="${path.basename(f.slug)}.html" data-tags="${f.tags.join(' ')}">
      <h3>${f.title}</h3>
      <p>${f.dateShort} · ${f.readTime} хв читання</p>
    </a>`).join('')}
  </div>`;
  const script = `<script>
  function filterCards(btn, prefix) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.value;
    document.querySelectorAll('#'+prefix+'-grid .book-card').forEach(card => {
      card.hidden = val !== 'all' && !card.dataset.tags.split(' ').includes(val);
    });
  }
  </script>`;
  return filterBar + cards + script;
}

const GRAPH_SCRIPT = `
(function(){
  const RAINBOW = ['#ff0080','#ff8c00','#ffe000','#40e0d0','#7b6cf0','#ff0080'];
  const FOLDER_COLORS = ['#7b6cf0','#ff8c00','#40e0d0','#ff0080','#ffe000','#a0e0a0'];
  const graphDataParsed = GRAPH_DATA_PLACEHOLDER;
  const rawNodes = graphDataParsed.nodes;
  const tagEdges = graphDataParsed.tagEdges;
  const folderColorMap = {};
  let folderIdx = 0;
  rawNodes.forEach(n => { if (n.folder && !folderColorMap[n.folder]) { folderColorMap[n.folder] = FOLDER_COLORS[folderIdx++ % FOLDER_COLORS.length]; } });
  const canvas = document.getElementById('graph');
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('graph-tooltip');
  const PR = window.devicePixelRatio || 1;
  let W, H, nodes = [], running = true;
  let transform = {x:0, y:0, scale:1};
  let drag = null, hovered = null, settled = false, tick = 0, rbOffset = 0;
  let lastDragMoved = false;
  // time-evolution playback state
  let evoActive = false, evoStart = 0, evoDuration = 14000, evoMinDate = 0, evoRange = 1;
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const cW = () => W / PR;
  const cH = () => H / PR;
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); W = canvas.width = r.width * PR; H = canvas.height = r.height * PR; canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px'; ctx.scale(PR, PR); }
  function initNodes() {
    const cx = cW()/2, cy = cH()/2;
    const folders = [...new Set(rawNodes.map(n => n.folder).filter(Boolean))];
    const byFolder = {};
    folders.forEach(f => byFolder[f] = rawNodes.filter(n => n.folder === f));
    nodes = [];
    folders.forEach((fname) => {
      const color = folderColorMap[fname] || '#7b6cf0';
      const angle0 = (Object.keys(folderColorMap).indexOf(fname) / folders.length) * Math.PI * 2 - Math.PI / 2;
      const cr = Math.min(cW(), cH()) * 0.04;
      const fcx = cx + Math.cos(angle0) * cr;
      const fcy = cy + Math.sin(angle0) * cr;
      byFolder[fname].forEach((n, ni) => {
        const a2 = (ni / Math.max(byFolder[fname].length, 1)) * Math.PI * 2;
        const nr = 18 + byFolder[fname].length * 4;
        nodes.push({ ...n, isHub: false, isTagNode: false, x: fcx + Math.cos(a2) * nr, y: fcy + Math.sin(a2) * nr, vx: 0, vy: 0, r: 8, color, reveal: 1, seed: Math.random()*1000, freqX: 0.1+Math.random()*0.15, freqY: 0.1+Math.random()*0.15 });
      });
    });
    const tagOnlyNodes = rawNodes.filter(n => n.isTag);
    tagOnlyNodes.forEach((n, ti) => {
      const angle = (ti / Math.max(tagOnlyNodes.length, 1)) * Math.PI * 2;
      const tr = Math.min(cW(), cH()) * 0.05;
      nodes.push({ ...n, isHub: false, isTagNode: true, x: cx + Math.cos(angle) * tr + (Math.random()-0.5)*15, y: cy + Math.sin(angle) * tr + (Math.random()-0.5)*15, vx: 0, vy: 0, r: 5, color: '#666', reveal: 1, seed: Math.random()*1000, freqX: 0.1+Math.random()*0.15, freqY: 0.1+Math.random()*0.15 });
    });
    tick = 0; settled = false;
    const legendEl = document.getElementById('graph-legend');
    if (legendEl) { legendEl.innerHTML = ''; folders.forEach(fname => { const item = document.createElement('div'); item.className = 'graph-legend-item'; item.innerHTML = '<div class="graph-legend-dot" style="background:'+folderColorMap[fname]+'"></div><span>'+fname+'</span>'; legendEl.appendChild(item); }); }
  }
  function getEdges() {
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].isHub || nodes[i].isTagNode) continue;
      for (let j = i+1; j < nodes.length; j++) { if (!nodes[j].isHub && !nodes[j].isTagNode && nodes[j].folder === nodes[i].folder) { edges.push([i, j]); } }
    }
    tagEdges.forEach(({ from, to }) => { const fromIdx = nodes.findIndex(n => n.id === from); const toIdx = nodes.findIndex(n => n.id === to); if (fromIdx !== -1 && toIdx !== -1) edges.push([fromIdx, toIdx]); });
    return edges;
  }
  function applyForces(edges) {
    const iters = tick < 120 ? 5 : 1;
    const t = Date.now() / 1000;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]; if (drag?.node === a) continue;
        if (a.reveal < 0.04) continue; // not born yet during evolution playback
        let fx = 0, fy = 0;
        for (let j = 0; j < nodes.length; j++) { if (i === j) continue; const b = nodes[j]; if (b.reveal < 0.04) continue; const dx = a.x-b.x, dy = a.y-b.y; const f = 190 / Math.max(dx*dx+dy*dy, 1); fx += dx*f*b.reveal; fy += dy*f*b.reveal; }
        for (const [s,t2] of edges) { if (s === i || t2 === i) { const b = nodes[s === i ? t2 : s]; if (b.reveal < 0.3) continue; const dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy)||1; const rest = (a.isTagNode || b.isTagNode) ? 30 : 20; const f = 0.035*(d - rest); fx += dx/d*f; fy += dy/d*f; } }
        fx += (cW()/2 - a.x) * 0.022; fy += (cH()/2 - a.y) * 0.022;
        // gentle idle wander once settled — keeps the graph feeling alive, not frozen
        if (settled && !drag) { fx += Math.sin(t*a.freqX + a.seed) * 0.35; fy += Math.cos(t*a.freqY + a.seed*1.6) * 0.35; }
        a.vx = (a.vx + fx) * 0.8; a.vy = (a.vy + fy) * 0.8; a.x += a.vx; a.y += a.vy;
      }
    }
    tick++; if (!settled && (tick === 60 || tick === 120)) { graphFitAll(); } if (!settled && tick === 120) settled = true;
  }
  function updateDrag(){
    // the dragged node eases toward the pointer instead of teleporting — smooth, elastic follow.
    // Runs every frame regardless of the running/paused flag, so dragging stays smooth even when physics is paused.
    if (!drag?.node) return;
    const n = drag.node;
    if (typeof n.dragTargetX !== 'number') return;
    n.x += (n.dragTargetX - n.x) * 0.28;
    n.y += (n.dragTargetY - n.y) * 0.28;
    n.vx = 0; n.vy = 0;
  }
  function graphFitAll() { const visible = nodes.filter(n=>n.reveal>0.3); if (!visible.length) return; const pad = 80; const minX = Math.min(...visible.map(n=>n.x))-pad, maxX = Math.max(...visible.map(n=>n.x))+pad; const minY = Math.min(...visible.map(n=>n.y))-pad, maxY = Math.max(...visible.map(n=>n.y))+pad; const s = Math.min(cW()/(maxX-minX), cH()/(maxY-minY), 2); transform.scale = s; transform.x = (cW()-(maxX+minX)*s)/2; transform.y = (cH()-(maxY+minY)*s)/2; }
  window.graphFitAll = graphFitAll;
  window.graphZoom = function(factor) { const cx = cW()/2, cy = cH()/2; const ns = Math.min(5, Math.max(0.2, transform.scale*factor)); transform.x = cx - (cx - transform.x)*(ns/transform.scale); transform.y = cy - (cy - transform.y)*(ns/transform.scale); transform.scale = ns; };
  window.graphEvolve = function() {
    const dated = nodes.filter(n => typeof n.date === 'number' && isFinite(n.date));
    if (!dated.length) return;
    evoMinDate = Math.min(...dated.map(n=>n.date));
    const maxDate = Math.max(...dated.map(n=>n.date));
    evoRange = Math.max(maxDate - evoMinDate, 1);
    evoActive = true; evoStart = Date.now(); running = true; settled = false; tick = 0;
    nodes.forEach(n => { n.reveal = 0; n.revealAt = evoStart + ((typeof n.date === 'number' ? n.date - evoMinDate : evoRange) / evoRange) * evoDuration; });
    const btn = document.getElementById('graph-evolve');
    if (btn) btn.classList.add('playing');
  };
  function updateEvolution() {
    if (!evoActive) return;
    const now = Date.now();
    let allRevealed = true;
    nodes.forEach(n => {
      const target = now >= n.revealAt ? 1 : 0;
      if (target === 0) allRevealed = false;
      n.reveal += (target - n.reveal) * 0.09;
      if (n.reveal < 0.995 && target === 1) allRevealed = false;
    });
    if (now - evoStart > evoDuration + 1500 && allRevealed) {
      evoActive = false;
      nodes.forEach(n => n.reveal = 1);
      const btn = document.getElementById('graph-evolve');
      if (btn) btn.classList.remove('playing');
    }
  }
  function rbGrad(x, y, w) { const span = w * 4; const g = ctx.createLinearGradient(x-span/2, y, x+span/2, y); const shift = rbOffset % 1; RAINBOW.forEach((c,i) => { const pos = ((i/(RAINBOW.length-1)) + shift) % 1; g.addColorStop(Math.min(Math.max(pos,0),1), c); }); return g; }
  function drawRainbowCircle(x, y, r) { const g = ctx.createLinearGradient(x-r*8, y, x+r*8, y); const shift = rbOffset % 1; RAINBOW.forEach((c,i) => { const pos = ((i/(RAINBOW.length-1)) + shift) % 1; g.addColorStop(Math.min(Math.max(pos,0),1), c); }); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = isDark()?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.1)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  function drawRainbowText(text, x, y, size, bold) { ctx.font = (bold?'500 ':'400 ') + size + "px 'DM Sans',sans-serif"; const w = ctx.measureText(text).width; ctx.fillStyle = rbGrad(x, y, w); ctx.textAlign = 'center'; ctx.fillText(text, x, y); }
  let edges = [];
  function draw() {
    rbOffset += 0.005;
    ctx.save(); ctx.clearRect(0,0,cW(),cH()); ctx.save();
    ctx.translate(transform.x, transform.y); ctx.scale(transform.scale, transform.scale);
    for (const [s,t] of edges) {
      const a = nodes[s], b = nodes[t]; if (!a||!b) continue;
      const edgeAlpha = Math.min(a.reveal, b.reveal); if (edgeAlpha < 0.02) continue;
      const hi = hovered && (hovered===a||hovered===b); const isTagEdge = a.isTagNode || b.isTagNode;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      if (isTagEdge) ctx.setLineDash([2,4]); else ctx.setLineDash([]);
      ctx.globalAlpha = edgeAlpha;
      ctx.strokeStyle = hi ? (isDark()?'rgba(255,255,255,0.55)':'rgba(0,0,0,0.45)') : (isDark()?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.09)');
      ctx.lineWidth = hi?1.5:0.7; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (const n of nodes) {
      if (n.reveal < 0.02) continue;
      const isH = hovered === n; const isC = hovered && edges.some(([s,t])=>(nodes[s]===hovered&&nodes[t]===n)||(nodes[t]===hovered&&nodes[s]===n)); const dim = hovered && !isH && !isC;
      ctx.globalAlpha = (dim ? 0.15 : 1) * n.reveal;
      const NR = n.r, HR = NR + 3;
      if (n.isTagNode) { const tagColor = isDark() ? (isH ? '#aaa' : '#555') : (isH ? '#444' : '#bbb'); ctx.globalAlpha = (dim ? 0.08 : 1) * n.reveal; ctx.font = (isH ? '500 ' : '400 ') + "10px 'DM Sans',sans-serif"; ctx.fillStyle = tagColor; ctx.textAlign = 'center'; ctx.fillText(n.title, n.x, n.y + 4); }
      else if (isH) { ctx.beginPath(); ctx.arc(n.x, n.y, HR+8, 0, Math.PI*2); ctx.fillStyle = isDark()?'rgba(123,108,240,0.12)':'rgba(123,108,240,0.08)'; ctx.fill(); drawRainbowCircle(n.x, n.y, HR); ctx.globalAlpha = n.reveal; const label = n.title.length > 22 ? n.title.slice(0,21)+'…' : n.title; drawRainbowText(label, n.x, n.y+HR+14, 11, true); }
      else { ctx.beginPath(); ctx.arc(n.x, n.y, NR, 0, Math.PI*2); ctx.fillStyle = n.color; ctx.fill(); ctx.strokeStyle = isDark()?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore(); ctx.restore();
  }
  function loop() { updateEvolution(); updateDrag(); if (running) applyForces(edges); draw(); requestAnimationFrame(loop); }
  function worldXY(ex,ey) { const r = canvas.getBoundingClientRect(); return {x:(ex-r.left-transform.x)/transform.scale, y:(ey-r.top-transform.y)/transform.scale}; }
  function nodeAt(ex,ey) { const {x,y} = worldXY(ex,ey); return nodes.find(n => { if (n.reveal < 0.3) return false; if (n.isTagNode) return Math.abs(n.x-x) < 30 && Math.abs(n.y-y) < 10; return Math.hypot(n.x-x, n.y-y) < n.r+10; }) || null; }
  canvas.addEventListener('mousemove', e => {
    const n = nodeAt(e.clientX,e.clientY); hovered = n; canvas.style.cursor = n ? 'pointer' : (drag ? 'grabbing' : 'grab');
    if (n) { tooltip.style.opacity = '1'; const r = canvas.getBoundingClientRect(); let tx = e.clientX-r.left+16, ty = e.clientY-r.top-10; if (tx+220>r.width) tx = e.clientX-r.left-225; tooltip.style.left = tx+'px'; tooltip.style.top = ty+'px'; if (n.isTagNode) { tooltip.innerHTML = '<span class="rb">'+n.title+'</span><br><span style="font-size:12px;color:var(--text-muted)">'+n.count+' нотаток</span>'; } else { tooltip.innerHTML = '<span class="rb">'+n.title+'</span><br><span style="font-size:11px;color:var(--text-muted)">'+(n.folder||'')+'</span>'+(n.excerpt ? '<br><span style="font-size:12px;color:var(--text);line-height:1.5;display:block;margin-top:4px">'+n.excerpt+'…</span>' : ''); } }
    else { tooltip.style.opacity = '0'; if (drag?.type==='pan') { transform.x += e.clientX-drag.lx; transform.y += e.clientY-drag.ly; drag.lx = e.clientX; drag.ly = e.clientY; } else if (drag?.type==='node') { const p = worldXY(e.clientX,e.clientY); drag.node.dragTargetX = p.x; drag.node.dragTargetY = p.y; drag.moved = true; lastDragMoved = true; } }
  });
  canvas.addEventListener('mousedown', e => { const n = nodeAt(e.clientX,e.clientY); if (n) { n.dragTargetX = n.x; n.dragTargetY = n.y; } drag = n ? {type:'node',node:n,moved:false} : {type:'pan',lx:e.clientX,ly:e.clientY}; lastDragMoved = false; if (n) running = false; });
  canvas.addEventListener('mouseup', () => { if(drag?.type==='node') running=true; drag=null; });
  canvas.addEventListener('mouseleave', () => { hovered=null; tooltip.style.opacity='0'; drag=null; running=true; });
  canvas.addEventListener('click', e => { if (lastDragMoved) { lastDragMoved=false; drag=null; return; } drag = null; const n = nodeAt(e.clientX,e.clientY); if (!n) return; if (n.isTagNode) { window.location.href = 'tag-'+n.tag+'.html'; return; } if (!n.isHub) window.location.href = n.id+'.html'; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); window.graphZoom(e.deltaY<0?1.08:0.93); },{passive:false});

  // ---- touch: one finger pans/drags a node, two fingers pinch-zoom ----
  let pinch = null, touchMoved = false;
  function touchDist(t0, t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }
  function touchMid(t0, t1){ return { x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2 }; }
  canvas.addEventListener('touchstart', e => {
    touchMoved = false;
    if (e.touches.length === 2) {
      drag = null;
      pinch = { dist: touchDist(e.touches[0], e.touches[1]), mid: touchMid(e.touches[0], e.touches[1]) };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const n = nodeAt(t.clientX, t.clientY);
      if (n) { n.dragTargetX = n.x; n.dragTargetY = n.y; running = false; }
      drag = n ? {type:'node',node:n,moved:false} : {type:'pan',lx:t.clientX,ly:t.clientY};
    }
  }, { passive:true });
  canvas.addEventListener('touchmove', e => {
    touchMoved = true;
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const newDist = touchDist(e.touches[0], e.touches[1]);
      const factor = newDist / (pinch.dist || newDist);
      window.graphZoom(factor);
      pinch.dist = newDist;
    } else if (e.touches.length === 1 && drag) {
      e.preventDefault();
      const t = e.touches[0];
      if (drag.type === 'pan') { transform.x += t.clientX-drag.lx; transform.y += t.clientY-drag.ly; drag.lx = t.clientX; drag.ly = t.clientY; }
      else if (drag.type === 'node') { const p = worldXY(t.clientX, t.clientY); drag.node.dragTargetX = p.x; drag.node.dragTargetY = p.y; drag.moved = true; }
    }
  }, { passive:false });
  canvas.addEventListener('touchend', e => {
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) {
      if (drag?.type === 'node') running = true;
      if (!touchMoved && drag?.type !== 'node') {
        // treat as a tap: reuse last known single-touch point via changedTouches
        const t = e.changedTouches[0];
        if (t) { const n = nodeAt(t.clientX, t.clientY); if (n) { if (n.isTagNode) { window.location.href = 'tag-'+n.tag+'.html'; } else if (!n.isHub) { window.location.href = n.id+'.html'; } } }
      }
      drag = null;
    }
  }, { passive:true });

  resize(); initNodes(); edges = getEdges(); loop();
})();
`;

// ============================================================
// RESEARCH PAGE — full-viewport graph, floating blurred menu window
// ============================================================
function renderResearchPage(files, graphData) {
  const graphScriptFilled = GRAPH_SCRIPT.replace('GRAPH_DATA_PLACEHOLDER', graphData);
  const randomNotes = JSON.stringify(files.filter(f => f.title !== 'index').map(f => path.basename(f.slug) + '.html'));

  return `<!DOCTYPE html>
<html lang="uk" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Map of Inquiry — Sasha's Garden</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overflow:hidden;}
:root[data-theme="dark"] { --bg:#0e0e0e; --bg2:#181818; --border:#262626; --text-muted:#555; --text:#999; --text-strong:#fff; }
:root[data-theme="light"] { --bg:#f5f5f0; --bg2:#e8e8e0; --border:#ddd; --text-muted:#aaa; --text:#555; --text-strong:#111; }
body{ font-family:'DM Sans',sans-serif; background:var(--bg); color:var(--text); }
@keyframes rainbow{ 0%{background-position:0%} 100%{background-position:200%} }
.grad{ background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; }

.graph-wrap-full{ position:fixed; inset:0; touch-action:none; }
#graph{ width:100%; height:100%; display:block; touch-action:none; }
.graph-tooltip{ position:absolute; background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:13px; color:var(--text); pointer-events:none; opacity:0; transition:opacity .15s; max-width:220px; line-height:1.6; font-family:'DM Sans',sans-serif; z-index:20; }
.graph-tooltip .rb{ background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:300%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 3s linear infinite; font-weight:500; }

/* floating blurred menu window */
.menu-window{ position:fixed; top:24px; left:24px; z-index:30; width:230px; background:rgba(24,24,24,0.55); backdrop-filter:blur(20px) saturate(140%); -webkit-backdrop-filter:blur(20px) saturate(140%); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px 22px; }
:root[data-theme="light"] .menu-window{ background:rgba(245,245,240,0.65); border:1px solid rgba(0,0,0,0.06); }
.menu-window-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.menu-window .site-title{ font-size:16px; font-weight:500; text-decoration:none; }
.menu-window-icons{ display:flex; gap:10px; }
.icon-btn{ background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; transition:color 0.15s; }
.icon-btn:hover{ color:var(--text-strong); }
.icon-btn svg{ width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.2; stroke-linecap:round; stroke-linejoin:round; }
.menu-window nav{ display:flex; flex-direction:column; gap:6px; }
.menu-window .nav-item{ font-size:14px; color:var(--text); padding:3px 0; text-decoration:none; border:none; background:none; font-family:'DM Sans',sans-serif; text-align:left; cursor:pointer; transition:color 0.15s; }
.menu-window .nav-item:hover{ color:var(--text-strong); }
.menu-window .nav-item.active{ background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:rainbow 4s linear infinite; }

.graph-ctrls{ position:fixed; top:24px; right:24px; z-index:30; display:flex; gap:6px; align-items:center; background:rgba(24,24,24,0.55); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:8px; }
:root[data-theme="light"] .graph-ctrls{ background:rgba(245,245,240,0.65); border:1px solid rgba(0,0,0,0.06); }
.graph-btn{ background:none; border:none; border-radius:6px; padding:5px 10px; font-size:13px; color:var(--text); cursor:pointer; font-family:'DM Sans',sans-serif; line-height:1; }
.graph-btn:hover{ color:var(--text-strong); }
.graph-btn#graph-evolve.playing{ background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe000,#40e0d0,#7b6cf0,#ff0080); background-size:200%; color:#fff; animation:rainbow 4s linear infinite; }
.graph-sep{ width:1px; height:18px; background:var(--border); }
.graph-legend{ position:fixed; bottom:24px; left:24px; z-index:30; display:flex; flex-direction:column; gap:6px; background:rgba(24,24,24,0.55); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 16px; }
:root[data-theme="light"] .graph-legend{ background:rgba(245,245,240,0.65); border:1px solid rgba(0,0,0,0.06); }
.graph-legend-item{ display:flex; align-items:center; gap:7px; font-size:11px; font-family:'DM Sans',sans-serif; color:var(--text-muted); }
.graph-legend-dot{ width:9px; height:9px; border-radius:50%; flex-shrink:0; }

.graph-menu-toggle{ display:none; }
.graph-scrim{ display:none; }

@media (max-width: 760px){
  .menu-window{
    width:min(74vw, 240px); top:14px; left:14px; padding:16px 18px;
    max-height:80vh; overflow-y:auto;
    transform:translateX(-120%); transition:transform .25s ease; z-index:36;
  }
  body.menu-open .menu-window{ transform:translateX(0); }
  .menu-window nav{ gap:10px; }
  .graph-menu-toggle{
    display:flex; position:fixed; top:14px; left:14px; z-index:35;
    width:40px; height:40px; align-items:center; justify-content:center;
    background:rgba(24,24,24,0.55); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,0.08); border-radius:12px; color:var(--text-strong); cursor:pointer;
  }
  :root[data-theme="light"] .graph-menu-toggle{ background:rgba(245,245,240,0.65); border:1px solid rgba(0,0,0,0.06); }
  .graph-menu-toggle svg{ width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; }
  body.menu-open .graph-scrim{ display:block; position:fixed; inset:0; z-index:29; background:rgba(0,0,0,.4); }
  .graph-ctrls{ top:auto; bottom:14px; right:14px; flex-wrap:wrap; max-width:min(50vw, 190px); gap:4px; padding:6px; justify-content:flex-end; }
  .graph-ctrls #graph-evolve{ font-size:11px; padding:4px 8px; }
  .graph-btn{ padding:4px 7px; font-size:12px; }
  .graph-legend{ bottom:14px; left:14px; padding:10px 12px; max-width:44vw; }
  .graph-legend-item{ font-size:10px; }
  .work-arrow{ display:none; }
}
</style>
</head>
<body>

<div class="graph-wrap-full">
  <canvas id="graph"></canvas>
  <div class="graph-tooltip" id="graph-tooltip"></div>
</div>

<button class="graph-menu-toggle" onclick="toggleGraphMenu()" aria-label="Меню">
  <svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
</button>
<div class="graph-scrim" onclick="toggleGraphMenu()"></div>

<div class="menu-window">
  <div class="menu-window-top">
    <a class="site-title grad" href="index.html">Sasha's Garden</a>
    <div class="menu-window-icons">
      <button class="icon-btn" onclick="toggleTheme()">
        <svg id="icon-moon" viewBox="0 0 24 24"><path d="M20 13.5a8.5 8.5 0 1 1-9-9 6 6 0 0 0 9 9z"/></svg>
        <svg id="icon-sun" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>
      </button>
    </div>
  </div>
  <nav>
    <a class="nav-item active" href="index.html">Map of Inquiry</a>
    <a class="nav-item" href="books.html">Book Reviews</a>
    <a class="nav-item" href="blog.html">Blog Notes</a>
    <a class="nav-item" href="seeds.html">Seeds</a>
    <button class="nav-item" onclick="goRandom()">Random Note</button>
    <a class="nav-item" href="https://dnaroxela.xyz" target="_blank">Work <span class="work-arrow">↗</span></a>
  </nav>
</div>

<div class="graph-ctrls">
  <button class="graph-btn" id="graph-evolve" onclick="graphEvolve()" title="Показати еволюцію графу в часі">▶ Evolution</button>
  <div class="graph-sep"></div>
  <button class="graph-btn" onclick="graphFitAll()">⊡</button>
  <div class="graph-sep"></div>
  <button class="graph-btn" onclick="graphZoom(1.25)">+</button>
  <button class="graph-btn" onclick="graphZoom(0.8)">−</button>
</div>

<div class="graph-legend" id="graph-legend"></div>

<script>
(function(){
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = t;
  if (t === 'light') {
    const m = document.getElementById('icon-moon'), s = document.getElementById('icon-sun');
    if (m) m.style.display = 'none';
    if (s) s.style.display = '';
  }
})();
function toggleTheme(){const h=document.documentElement,m=document.getElementById('icon-moon'),s=document.getElementById('icon-sun');if(h.dataset.theme==='dark'){h.dataset.theme='light';localStorage.setItem('theme','light');m.style.display='none';s.style.display='';}else{h.dataset.theme='dark';localStorage.setItem('theme','dark');m.style.display='';s.style.display='none';}}
function toggleGraphMenu(){document.body.classList.toggle('menu-open');}
const RANDOM_NOTES = ${randomNotes};
function goRandom(){if(!RANDOM_NOTES.length)return;window.location.href=RANDOM_NOTES[Math.floor(Math.random()*RANDOM_NOTES.length)];}
</script>
<script>${graphScriptFilled}</script>
</body>
</html>`;
}

async function build() {
  console.log('📁 Vault:', VAULT);
  console.log('📁 Building into:', OUT);
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const files = readFiles(VAULT);
  const treeHtml = renderTree(files);
  const graphData = buildGraphData(files);
  const bookFiles = files.filter(f => f.folder && f.folder.startsWith('Book Reviews'));
  const coversCache = await resolveCovers(bookFiles);

  // Homepage — Map of Inquiry (full-viewport graph, floating blurred menu) is now the site's index.html
  fs.writeFileSync(path.join(OUT, 'index.html'), renderResearchPage(files, graphData));


  // Blog Notes — tag filter + date
  const blogFiles = files.filter(f => f.folder && f.folder.startsWith('Blog Notes'));
  const blogContent = `
    <h1 class="article-title">Blog Notes</h1>
    <p class="meta">${blogFiles.length} нотаток</p>
    ${buildFilteredList(blogFiles, 'blog')}
  `;
  fs.writeFileSync(path.join(OUT, 'blog.html'), template({ title: 'Blog Notes', content: blogContent, isIndex: false, isResearch: false, isBlog: true, file: null, treeHtml, allFiles: files }));

  // Book Reviews
  const allBookTags = [...new Set(bookFiles.flatMap(f => f.tags))].sort();
  const booksContent = `
    <h1 class="article-title">Book Reviews</h1>
    <p class="meta">${bookFiles.length} книг</p>
    <div class="filter-bar">
      <button class="filter-btn active" data-value="all" onclick="filterBooks(this)">Всі</button>
      ${allBookTags.map(t => `<button class="filter-btn" data-value="${t}" onclick="filterBooks(this)">#${t}</button>`).join('')}
    </div>
    <div class="covers-grid" id="books-grid">
      ${bookFiles.map(f => {
        const cover = coversCache[f.title];
        const coverHtml = cover
          ? `<div class="book-cover"><img src="${cover}" alt="${f.title}" loading="lazy"></div>`
          : `<div class="book-cover"><div class="book-cover-placeholder">${f.title}</div></div>`;
        return `<a class="cover-card" href="${path.basename(f.slug)}.html" data-tags="${f.tags.join(' ')}">
          ${coverHtml}
          <div class="book-info">
            <h3>${f.title}</h3>
            <p>${[f.author, f.year].filter(Boolean).join(' · ')}</p>
          </div>
        </a>`;
      }).join('')}
    </div>
    <script>
    function filterBooks(btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.value;
      document.querySelectorAll('#books-grid .cover-card').forEach(card => {
        card.hidden = val !== 'all' && !card.dataset.tags.split(' ').includes(val);
      });
    }
    </script>
  `;
  fs.writeFileSync(path.join(OUT, 'books.html'), template({ title: 'Book Reviews', content: booksContent, isIndex: false, isResearch: false, file: null, treeHtml, allFiles: files }));

  // Seeds — tag filter + date
  const seedFiles = files.filter(f => f.folder && f.folder.startsWith('Seeds'));
  const seedsContent = `
    <h1 class="article-title">Seeds</h1>
    <p class="meta">${seedFiles.length} нотаток</p>
    ${buildFilteredList(seedFiles, 'seeds')}
  `;
  fs.writeFileSync(path.join(OUT, 'seeds.html'), template({ title: 'Seeds', content: seedsContent, isIndex: false, isResearch: false, isSeeds: true, file: null, treeHtml, allFiles: files }));

  // Individual notes
  for (const file of files) {
    if (file.title === 'index') continue;
    const withWikilinks = convertWikilinks(file.body, files);
    const rawFixed = convertEmbeds(withWikilinks, file).replace(/==([^=]+)==/g, '<mark>$1</mark>');
    const rawClean = rawFixed.replace(/(?<![#\n]) *#([\p{L}_][\p{L}\p{N}_-]*)/gu, '').replace(/^\s*#([\p{L}_][\p{L}\p{N}_-]*)(\s|$)/gmu, '');
    const fileKey = path.basename(file.slug);
    const { raw: rawWithFootnotes, footnotes } = extractFootnotes(rawClean, fileKey);
    const bodyHtml = resolveMdLinks(marked(rawWithFootnotes), files);
    const hasFootnotes = footnotes.length > 0;
    const footnoteStore = hasFootnotes
      ? '<div class="fn-store" style="display:none">' + footnotes.map(f => `<div id="${f.id}">${f.html}</div>`).join('') + '</div>'
      : '';
    const footnotesMobile = hasFootnotes
      ? '<div class="footnotes-mobile">' + footnotes.map((f, i) => `<div class="fn-mobile-item"><a class="fn-mobile-num" href="#fnref-${f.id}">(${i+1})</a>${f.html}</div>`).join('') + '</div>'
      : '';
    const isBook = file.folder && file.folder.startsWith('Book Reviews');
    const articleHtml = hasFootnotes
      ? `<div class="article-grid"><div class="main-col"><article class="article-body">${bodyHtml}</article>${footnoteStore}${footnotesMobile}</div><div class="note-col" id="noteCol"></div></div>`
      : `<article class="article-body">${bodyHtml}</article>`;
    const content = `
      ${renderBreadcrumbs(file)}
      <h1 class="article-title">${file.title}</h1>
      <p class="meta">${file.dateShort} · ${file.readTime} хв читання</p>
      ${renderTags(file.tags)}
      ${articleHtml}
      ${isBook ? '' : '<hr class="divider"><p class="last-modified">Оновлено: ' + file.dateStr + '</p>'}
    `;
    const outPath = path.join(OUT, path.basename(file.slug) + '.html');
    fs.writeFileSync(outPath, template({ title: file.title, content, isIndex: false, isResearch: false, file, treeHtml, allFiles: files, hasFootnotes }));
    console.log('✓', file.title);
  }

  console.log('\n✅ Сайт згенеровано в папку docs/');

  // Tag pages
  const allTags = [...new Set(files.flatMap(f => f.tags))];
  for (const tag of allTags) {
    const tagged = files.filter(f => f.tags.includes(tag));
    const tagContent = `
      <h1 class="article-title">#${tag}</h1>
      <p class="meta">${tagged.length} ${tagged.length === 1 ? 'нотатка' : 'нотаток'}</p>
      <div class="books-grid" style="margin-top:24px">
        ${tagged.map(f => `<a class="book-card" href="${path.basename(f.slug)}.html">
          <h3>${f.title}</h3>
          <p>${f.folder ? f.folder.split(path.sep)[0] : ''} · ${f.dateShort} · ${f.readTime} хв читання</p>
        </a>`).join('')}
      </div>
    `;
    fs.writeFileSync(path.join(OUT, `tag-${tag}.html`), template({ title: '#' + tag, content: tagContent, isIndex: false, isResearch: false, file: null, treeHtml, allFiles: files }));
    console.log('🏷 tag:', tag);
  }
  await buildApp(files, coversCache);
}

// ============================================================
// New site (one-page app): docs/index.html + redirects for old URLs
// ============================================================
// The design lives in app/index.template.html. build.js fills it with:
//   /*DATA*/     every note in a folder: html, tags, links, dates, book author/year, cover
//   /*JOURNAL*/  docs/journal.json — what changed between builds (kept and extended on every run)
//   /*TRAILS*/   routes through the garden from a note called «Стежки» (see parseTrails below)
//   /*SERIES*/   the «Серіали» tab of the shelf, from a note called «Серіали» (see parseSeries below)
//   /*FILMS*/    the «Фільми» tab, from MUBI ratings (see resolveFilms below; kept in docs/films.json)
// Old per-note pages (note.html, books.html, tag-x.html…) become tiny redirects into the app,
// so links that are already shared keep working. HTML files that no longer belong to any note are removed.
const crypto = require('crypto');
const APP_DIR = path.join(__dirname, 'app');

function plainParas(html) {
  return [...html.matchAll(/<(p|li|h[1-6]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(m => m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 2);
}
const hashText = t => crypto.createHash('md5').update(t).digest('hex').slice(0, 10);

function noteExcerpt(raw) {
  const clean = raw
    .replace(/^---[\s\S]*?---/, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/^>\s*\[![^\]]*\].*$/gm, '')
    .replace(/(^|\s)#[a-zA-Zа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ-]*/g, ' ')
    .replace(/[#*`_\[\]>]/g, '')
    .replace(/\s+/g, ' ').trim();
  return (clean.split(/[.!?]\s+/)[0] || '').trim().slice(0, 160);
}

// «Стежки» note format (any folder or none):
//   ## Про подив
//   Від Рейчел Карсон до Гелен Де Круз.
//   - [[The Sense of Wonder]]
//   - [[Wonderstruck]]
function parseTrails(files) {
  const f = files.find(x => x.title.trim().toLowerCase() === 'стежки');
  if (!f) return [];
  return f.body.split(/^##\s+/m).slice(1).map(block => {
    const lines = block.split('\n');
    const name = lines[0].trim();
    const desc = (lines.slice(1).find(l => l.trim() && !/^\s*[-*\d]/.test(l)) || '').trim();
    const ids = [...block.matchAll(/\[\[([^\]|#]+)/g)].map(m => {
      const t = m[1].trim().toLowerCase();
      const hit = files.find(x => x.title.trim().toLowerCase() === t);
      return hit ? path.basename(hit.slug) : null;
    }).filter(Boolean);
    return { name, desc, ids };
  }).filter(t => t.name && t.ids.length > 1);
}

// «Серіали» note format (any folder or none), one show per line, parts split by a dash, in any order after the title:
//   - Homeland — 5/5 — rewatched — Drama, Espionage, thriller
//   - Nobody Wants This — watching
// ## headings are kept as groups. A part that looks like a score (4/5, 9, 8.5, ★★★★) is the rating;
// a status word (watching, rewatched, dropped…) is the status; everything else is genres (comma-separated).
// An image link on the line (![](url) or a bare https://….jpg) overrides the cover.
const RATING_RE = /^(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[★☆⭐]+)[^\p{L}\d]*$/u;
const STATUS_RE = /^(watching|rewatch(ed|ing)?|re-?watched|dropped|paused|on hold|finished|(want|plan) to (re-?)?watch|to (re-?)?watch|дивлюсь|дивлюся|передивилась|переглянула|кинула|на паузі|подивилась|хочу (пере)?подивитис[ья])$/i;
function parseSeries(files) {
  const f = files.find(x => x.title.trim().toLowerCase() === 'серіали');
  if (!f) return [];
  const out = [];
  let group = null;
  for (const line of f.body.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.+)/);
    if (h) { group = h[1].trim(); continue; }
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)/);
    if (!m) continue;
    let text = m[1];
    const img = text.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)|(https?:\/\/\S+\.(?:jpe?g|png|webp)(?:\?\S*)?)/i);
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
    const parts = text.split(/\s+[–—-]+\s+|\s*[–—]\s*/).map(p => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const title = parts.shift();
    let rating = null, status = null;
    const rest = parts.filter(p => {
      if (!rating && RATING_RE.test(p)) { rating = p.replace(/\s+/g, ''); return false; }
      if (!status && STATUS_RE.test(p)) { status = p.toLowerCase(); return false; }
      return true;
    });
    const genres = [...new Set(rest.join(', ').split(/\s*[,;]\s*/).map(g => g.trim().toLowerCase().replace(/\s*-\s*/g, ' ')).filter(Boolean))];
    out.push({ title, genres, rating, status, group, cover: img ? (img[1] || img[2]) : null });
  }
  return out;
}

// series covers: TVmaze (no key needed), then the iTunes store; cached next to book covers as "tv:<title>".
// Returns undefined when the network failed, so that title is tried again on the next build.
async function fetchSeriesCover(title) {
  let reached = false;
  try {
    const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`);
    reached = true;
    if (res.ok) {
      const d = await res.json();
      const u = d.image && (d.image.original || d.image.medium);
      if (u) return u.replace(/^http:/, 'https:');
    }
  } catch {}
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=tvShow&entity=tvSeason&limit=1&term=${encodeURIComponent(title)}`);
    reached = true;
    const d = await res.json();
    const u = d.results && d.results[0] && d.results[0].artworkUrl100;
    if (u) return u.replace(/100x100bb/, '600x600bb');
  } catch {}
  return reached ? null : undefined;
}
async function resolveSeriesCovers(series) {
  const cache = loadCoversCache();
  const toFetch = series.filter(s => !s.cover && !(('tv:' + s.title) in cache));
  if (toFetch.length) {
    console.log(`Завантажую ${toFetch.length} обкладинок серіалів...`);
    const results = await Promise.all(toFetch.map(s => fetchSeriesCover(s.title)));
    toFetch.forEach((s, i) => { if (results[i] !== undefined) cache['tv:' + s.title] = results[i]; });
    saveCoversCache(cache);
  }
  for (const s of series) if (!s.cover) s.cover = cache['tv:' + s.title] || null;
  // genres written in the note win; for the rest ask Wikipedia (cached as "wd:<title>")
  const noGenres = series.filter(s => !s.genres.length && !(('wd:' + s.title) in cache));
  if (noGenres.length) {
    console.log(`Шукаю жанри ${noGenres.length} серіалів у Вікіпедії...`);
    for (const s of noGenres) {
      try { const w = await wikiLookup(s.title, null, 'series'); cache['wd:' + s.title] = w ? w.genres : []; }
      catch { /* offline: try again next build */ }
    }
    saveCoversCache(cache);
  }
  for (const s of series) if (!s.genres.length) s.genres = tidyGenres(cache['wd:' + s.title]);
  return series;
}

const { resolveFilms, visibleFilms } = require('./films');
const { wikiLookup, tidyGenres } = require('./wiki');

function redirectPage(target, title) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(title)} — Sasha's Garden</title>
<meta http-equiv="refresh" content="0; url=${esc(target)}"><link rel="canonical" href="${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script></head>
<body><p><a href="${esc(target)}">${esc(title)}</a></p></body></html>`;
}

// нотатка-дошка (властивість layout: board або дошка):
//   текст до першого ### — звичайна нотатка, вона стоїть ліворуч від дошки;
//   кожен ### — джерело; його пункти списку — цитати (^id у кінці рядка), пункти-посилання без тексту — матеріали джерела;
//   ==виділене== у цитаті — те, що видно на картці (інакше перше речення);
//   «## Зв'язки» — рядки `- [[#^a]] → [[#^b]] — підпис` ([[#Джерело]] — зв'язок із самим джерелом);
//   блок `%% дошка` … `%%` — теми: `Назва теми: id, id, id`; цитати без теми йдуть у «Нерозібране».
const isBoardNote = file => /^(board|дошка)$/i.test(String(file.fm.layout || '').trim());
const BOARD_URL = /https?:\/\/[^\s)]+/g;
const boardSlug = s => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[’']s\b.*$/, '').trim().split(/\s+/).pop().replace(/[^\p{L}\p{N}]/gu, '');
function parseBoard(body) {
  const first = body.search(/^###\s/m);
  if (first < 0) return { intro: body, sources: [], quotes: [], edges: [], zones: [] };
  const intro = body.slice(0, first), rest = body.slice(first);
  const relAt = rest.search(/^##\s+Зв['’]язки/m);
  const main = relAt < 0 ? rest : rest.slice(0, relAt), tail = relAt < 0 ? '' : rest.slice(relAt);
  const sources = [], quotes = [], byId = {};
  let cur = null;
  for (const line of main.replace(/%%[\s\S]*?%%/g, '').split('\n')) {
    const h = line.match(/^###\s+(.*)/);
    if (h) {
      const title = h[1].trim(), plain = title.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      cur = { id: boardSlug(title), title, short: ((plain.match(/^(.*?)[’']s\b/) || [, plain])[1]).trim(), links: [] };
      sources.push(cur); continue;
    }
    if (!cur || !line.trim()) continue;
    let text = line.replace(/^\s*(?:\d+\.|[*-])\s+/, '').trim();
    let id = null;
    const idm = text.match(/\s\^([\w-]+)$/);
    if (idm) { id = idm[1]; text = text.slice(0, idm.index).trim(); }
    const urls = text.match(BOARD_URL);
    if (!id && urls && text.replace(BOARD_URL, '').trim().length < 60) { cur.links.push({ url: urls[0], label: text.replace(BOARD_URL, '').trim() }); continue; }
    id = id || cur.id + (quotes.filter(q => q.src === cur.id).length + 1);
    // хто сказав: «Ім'я Прізвище: …» на початку або «… Ім'я Прізвище» в кінці короткої цитати
    let who = null, m;
    if ((m = text.match(/^([A-ZА-ЯІЇЄҐ][\p{L}.]+(?: [A-ZА-ЯІЇЄҐ][\p{L}.]+){1,2}):\s+/u))) { who = m[1]; text = text.slice(m[0].length); }
    else if (text.length < 160 && (m = text.match(/[.!?…]\s+([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})$/))) { who = m[1]; text = text.slice(0, -m[1].length).trim(); }
    const q = { id, src: cur.id, text, who };
    quotes.push(q); byId[id] = q;
  }
  const node = x => byId[x] ? x : (sources.some(s => s.id === boardSlug(x)) ? '#' + boardSlug(x) : null);
  const edges = [];
  for (const m of tail.matchAll(/^\s*[-*]\s*\[\[#\^?([^\]|]+)[^\]]*\]\]\s*(?:→|->)\s*\[\[#\^?([^\]|]+)[^\]]*\]\]\s*(?:[—–-]\s*(.+))?$/gm)) {
    const a = node(m[1].trim()), b = node(m[2].trim());
    if (a && b) edges.push({ a, b, label: (m[3] || '').trim() });
  }
  const zones = [], placed = new Set();
  const block = tail.match(/%%\s*дошка\s*\n([\s\S]*?)%%/i);
  if (block) for (const l of block[1].split('\n')) {
    const m = l.match(/^(.+?):\s*(.*)$/);
    if (!m) continue;
    const ids = m[2].split(',').map(s => s.trim().replace(/^\^/, '')).filter(id => byId[id] && !placed.has(id));
    ids.forEach(id => placed.add(id));
    zones.push({ name: m[1].trim(), ids });
  }
  const loose = quotes.filter(q => !placed.has(q.id)).map(q => q.id);
  if (loose.length) zones.push({ name: 'Нерозібране', ids: loose, inbox: true });
  return { intro, sources, quotes, edges, zones };
}
// суть цитати для картки: ==виділене== або перше речення
function boardGist(text) {
  const hl = [...text.matchAll(/==(.+?)==/g)].map(m => m[1]);
  const plain = s => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(BOARD_URL, '').replace(/==/g, '').replace(/\s+/g, ' ').trim();
  if (hl.length) return plain(hl.join(' … '));
  const p = plain(text), s = p.match(/^.{20,}?[.!?…](?=\s|$)/);
  return s ? s[0] : p;
}

// дошка з Obsidian Canvas: файл «<Назва нотатки>.canvas» будь-де в сховищі стає дошкою цієї нотатки
// (і має перевагу над дошкою зі списків у самій нотатці). Картки стоять так само, як у Canvas:
// групи з назвами, текстові картки, картинки, посилання, нотатки, стрілки з підписами.
// У текстовій картці останній рядок «— Хтось» — підпис джерела, «^id» у кінці — мітка для [[#^id|посилань]] з тексту нотатки.
function readCanvases(dir, out = {}) {
  for (const item of fs.readdirSync(dir)) {
    if (item.startsWith('.') || item === 'private' || item === 'templates') continue;
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) readCanvases(full, out);
    else if (item.endsWith('.canvas')) {
      try { out[item.slice(0, -7).trim().toLowerCase()] = JSON.parse(fs.readFileSync(full, 'utf8')); }
      catch (e) { console.log('⚠️ не вдалося прочитати', item, e.message); }
    }
  }
  return out;
}
const CANVAS_IMG = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
function canvasBoard(json, { block, noteId }) {
  const nodes = (json.nodes || []).filter(n => ['text', 'file', 'link', 'group'].includes(n.type) && isFinite(n.x) && isFinite(n.y));
  if (!nodes.length) return null;
  const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y));
  const out = nodes.map(n => {
    const o = { id: n.id, type: n.type, x: n.x - minX, y: n.y - minY, w: n.width || 250, h: n.height || 60, color: n.color || null };
    if (n.type === 'group') o.label = n.label || '';
    else if (n.type === 'link') o.url = n.url;
    else if (n.type === 'text') {
      let t = String(n.text || '');
      const id = t.match(/\s\^([\w-]+)\s*$/);
      if (id) { o.qid = id[1]; t = t.slice(0, id.index); }
      const by = t.match(/\n\s*[—–]\s*([^\n]+?)\s*$/);
      if (by) { o.src = by[1].replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); t = t.slice(0, by.index); }
      o.html = block(t);
      o.plain = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[=*_#>`[\]]/g, '').replace(/\s+/g, ' ').trim();
    } else {
      const f = String(n.file || ''), name = path.basename(f);
      if (CANVAS_IMG.test(f)) {
        const src = path.join(VAULT, f), dest = path.join(OUT, name);
        if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
        o.img = name;
      } else {
        o.title = name.replace(/\.md$/i, '');
        o.note = noteId(o.title);
      }
    }
    return o;
  });
  const ids = new Set(out.map(n => n.id));
  const edges = (json.edges || []).filter(e => ids.has(e.fromNode) && ids.has(e.toNode))
    .map(e => ({ a: e.fromNode, b: e.toNode, fs: e.fromSide || null, ts: e.toSide || null, label: e.label || '', color: e.color || null }));
  return { canvas: true, nodes: out, edges };
}

// посилання (колишні «відео й подкасти»): обкладинка картки і тип (відео, подкаст, стаття…)
// обкладинка: властивість cover → app/covers → перша картинка в нотатці
// → кадр YouTube → og:image першого посилання (кешується в covers-cache.json як og:<адреса>)
const MEDIA_FOLDER = /^(links|посилання|videos \+ podcasts)$/i;
const MEDIA_TYPES = { video: 'відео', відео: 'відео', podcast: 'подкаст', подкаст: 'подкаст', article: 'стаття', стаття: 'стаття', essay: 'есей', есей: 'есей',
  book: 'книжка', книжка: 'книжка', course: 'курс', курс: 'курс', newsletter: 'розсилка', розсилка: 'розсилка', website: 'сайт', site: 'сайт', сайт: 'сайт', tool: 'інструмент', інструмент: 'інструмент' };
async function ogImage(url, cache) {
  const key = 'og:' + url;
  if (key in cache) return cache[key];
  let img = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const page = await res.text();
    const m = page.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || page.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (m) img = new URL(m[1].replace(/&amp;/g, '&'), url).href;
  } catch (e) { return null; } // збій мережі не кешуємо — спробуємо наступної збірки
  cache[key] = img;
  return img;
}
// обкладинка з властивості cover (посилання або [[картинка]] зі сховища, яку копіюємо в docs/)
function fmCover(file) {
  const fm = file.fm || {};
  let cover = fm.cover || fm.image || fm.poster || null;
  while (Array.isArray(cover)) cover = cover[0]; // [[картинка]] без лапок YAML читає як вкладений список
  if (!cover || /^https?:/.test(cover)) return cover;
  const name = String(cover).replace(/^!?\[\[|\]\]$/g, '').split('|')[0];
  const src = findMediaSrc(name, file);
  if (!src) return null;
  fs.copyFileSync(src, path.join(OUT, name));
  return encodeURI(name);
}
// обкладинка з репозиторію: app/covers/<id>.* або посилання в app/covers/covers.json ({"<id>": "https://…"})
function ownCover(id) {
  const dir = path.join(APP_DIR, 'covers');
  if (!fs.existsSync(dir)) return null;
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(dir, 'covers.json'), 'utf8')); } catch (e) {}
  if (map[id]) return map[id];
  const own = fs.readdirSync(dir).find(f => f !== 'covers.json' && f.replace(/\.[^.]+$/, '') === id);
  if (!own) return null;
  fs.mkdirSync(path.join(OUT, 'covers'), { recursive: true });
  fs.copyFileSync(path.join(dir, own), path.join(OUT, 'covers', own));
  return 'covers/' + encodeURIComponent(own);
}
async function mediaInfo(file, id, html, cache) {
  const fm = file.fm || {};
  const links = [...html.matchAll(/<a href="(https?:[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
  const text = (links.join(' ') + ' ' + html).toLowerCase();
  let kind = fm.type || fm.kind;
  while (Array.isArray(kind)) kind = kind[0];
  kind = kind ? (MEDIA_TYPES[String(kind).trim().toLowerCase()] || String(kind).trim().toLowerCase())
    : /youtube\.com|youtu\.be|vimeo\.com/.test(text) ? 'відео' : /spotify\.com|podcasts\.apple|podcast|подкаст/.test(text) ? 'подкаст' : links.length ? 'стаття' : null;
  let cover = fmCover(file) || ownCover(id);
  if (!cover) cover = (html.match(/<img src="([^"]+)"/) || [])[1] || null;
  if (!cover) {
    const yt = links.map(u => u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)).find(Boolean);
    if (yt) cover = `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  }
  if (!cover && links.length) cover = await ogImage(links[0], cache);
  return { cover, kind };
}

async function buildApp(files, coversCache) {
  const notes = files.filter(f => f.folder && f.title.trim().toLowerCase() !== 'стежки');
  const ids = new Set(notes.map(f => path.basename(f.slug)));
  const canvases = readCanvases(VAULT);
  const data = notes.map(file => {
    const id = path.basename(file.slug);
    const canvas = canvases[file.title.trim().toLowerCase()];
    const board = !canvas && isBoardNote(file) ? parseBoard(file.body) : null;
    // у дошці [[#^id|текст]] веде до цитати на дошці
    const qrefs = s => board || canvas ? s.replace(/\[\[#\^([\w-]+)(?:\|([^\]]+))?\]\]/g, (m, q, t) => `<a href="#" data-q="${q}">${t || q}</a>`) : s;
    const withWikilinks = convertWikilinks(qrefs(board ? board.intro : file.body), files);
    const rawFixed = convertEmbeds(withWikilinks, file).replace(/==([^=]+)==/g, '<mark>$1</mark>');
    const rawClean = rawFixed.replace(/(?<![#\n]) *#([\p{L}_][\p{L}\p{N}_-]*)/gu, '').replace(/^\s*#([\p{L}_][\p{L}\p{N}_-]*)(\s|$)/gmu, '');
    const { raw: withFn, footnotes } = extractFootnotes(rawClean, id);
    let html = resolveMdLinks(marked(withFn), files);
    if (footnotes.length) html += `<section class="footnotes"><ol>${footnotes.map(f => `<li id="${f.id}">${f.html}</li>`).join('')}</ol></section>`;
    const links = new Set();
    const noteLinks = h => h.replace(/<a href="([^"#?]+)\.html"/g, (m, slug) => {
      let s; try { s = decodeURIComponent(slug); } catch (e) { s = slug; }
      if (ids.has(s) && s !== id) { links.add(s); return `<a href="#note" data-note="${s}"`; }
      return m;
    });
    html = noteLinks(html);
    const inline = s => noteLinks(resolveMdLinks(marked.parseInline(convertWikilinks(s, files)), files))
      .replace(/==([^=]+)==/g, '<mark>$1</mark>').replace(/<a href="http/g, '<a target="_blank" rel="noopener" href="http');
    const block = s => noteLinks(resolveMdLinks(marked(convertEmbeds(convertWikilinks(s, files), file)), files))
      .replace(/==([^=]+)==/g, '<mark>$1</mark>').replace(/<a href="http/g, '<a target="_blank" rel="noopener" href="http');
    const noteId = t => { const f = files.find(x => x.title.trim().toLowerCase() === t.trim().toLowerCase()); const s = f && path.basename(f.slug); return s && ids.has(s) ? s : null; };
    const isBook = file.folder.startsWith('Book Reviews');
    return {
      id, title: file.title, folder: file.folder.split(path.sep)[0], tags: file.tags,
      excerpt: noteExcerpt(board ? board.intro : file.raw), date: file.dateMs, links: [...links],
      book: isBook ? ([file.author, file.year].filter(Boolean).join(' · ') || null) : null,
      cover: isBook ? (fmCover(file) || ownCover(id) || coversCache[file.title] || null) : null,
      html,
      board: canvas ? canvasBoard(canvas, { block, noteId }) || undefined : board && board.quotes.length ? {
        sources: board.sources.map(s => ({ id: '#' + s.id, title: inline(s.title), short: s.short, links: s.links })),
        quotes: board.quotes.map(q => ({ id: q.id, src: '#' + q.src, who: q.who, html: inline(q.text), gist: boardGist(q.text),
          words: q.text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(BOARD_URL, '').split(/\s+/).filter(Boolean).length })),
        edges: board.edges, zones: board.zones,
      } : undefined,
    };
  });

  const mediaCache = loadCoversCache();
  for (const n of data) {
    if (!MEDIA_FOLDER.test(n.folder)) continue;
    n.media = await mediaInfo(notes.find(f => path.basename(f.slug) === n.id), n.id, n.html, mediaCache);
  }
  saveCoversCache(mediaCache);

  // journal: compare paragraphs with the previous build
  const STATE = path.join(OUT, 'garden-state.json'), JOURNAL = path.join(OUT, 'journal.json');
  let state = null, journal = [];
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  try { journal = JSON.parse(fs.readFileSync(JOURNAL, 'utf8')); } catch (e) {}
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nextState = {};
  for (const n of data) {
    const paras = plainParas(n.html), words = paras.reduce((s, p) => s + p.split(' ').length, 0);
    const hashes = paras.map(hashText);
    nextState[n.id] = { h: hashes, w: words };
    if (!state) continue; // first run only records the starting point
    const prev = state[n.id];
    let e = null;
    if (!prev) e = { date: today, id: n.id, kind: 'new', add: hashes.length, rem: 0, words };
    else {
      const ph = new Set(prev.h), ch = new Set(hashes);
      const add = hashes.filter(h => !ph.has(h)).length, rem = prev.h.filter(h => !ch.has(h)).length;
      if (add || rem) e = { date: today, id: n.id, kind: 'edit', add, rem, words: words - prev.w };
    }
    if (e) {
      const same = journal.find(j => j.date === e.date && j.id === e.id && j.kind !== 'first');
      if (same) { same.add += e.add; same.rem += e.rem; same.words += e.words; if (e.kind === 'new') same.kind = 'new'; }
      else journal.push(e);
    }
  }
  fs.writeFileSync(STATE, JSON.stringify(nextState));
  fs.writeFileSync(JOURNAL, JSON.stringify(journal));

  const json = v => JSON.stringify(v).replace(/<\//g, '<\\/');
  const tpl = fs.readFileSync(path.join(APP_DIR, 'index.template.html'), 'utf8');
  const series = await resolveSeriesCovers(parseSeries(files));
  const films = await resolveFilms(OUT);
  const page = tpl.replace('/*DATA*/', () => json(data)).replace('/*JOURNAL*/', () => json(journal)).replace('/*TRAILS*/', () => json(parseTrails(files)))
    .replace('/*SERIES*/', () => json(series)).replace('/*FILMS*/', () => json(visibleFilms(films)));
  const written = new Set(['index.html']);
  fs.writeFileSync(path.join(OUT, 'index.html'), page);
  for (const asset of fs.readdirSync(APP_DIR)) {
    if (asset.endsWith('.html') || asset === 'covers') continue; // covers/ копіює mediaInfo — лише потрібні
    fs.copyFileSync(path.join(APP_DIR, asset), path.join(OUT, asset));
  }

  // old URLs → the app
  const put = (name, target, title) => { fs.writeFileSync(path.join(OUT, name), redirectPage(target, title)); written.add(name); };
  for (const n of data) put(`${n.id}.html`, `index.html#n=${encodeURIComponent(n.id)}`, n.title);
  put('blog.html', 'index.html#blog', 'Есеї');
  put('books.html', 'index.html#shelf', 'Полиця');
  put('seeds.html', 'index.html#garden', 'Сад');
  put('research.html', 'index.html#map', 'Мапа');
  for (const t of new Set(files.flatMap(f => f.tags))) put(`tag-${t}.html`, 'index.html#garden', '#' + t);

  // remove pages of notes that no longer exist (keeps images and other files)
  for (const name of fs.readdirSync(OUT)) {
    if (name.endsWith('.html') && !written.has(name)) { fs.unlinkSync(path.join(OUT, name)); console.log('🧹 removed', name); }
  }
  console.log(`\n🌿 Новий сайт: ${data.length} нотаток, ${journal.length} записів у журналі`);
}

build().catch(console.error);

// ============================================================
// README — what changed in this version
// ============================================================
// - index.html: the homepage now uses the first ![[image]] embedded in your
//   index.md note as a full-screen background photo. That embed is removed
//   from the normal article body (so it doesn't also show inline) and all
//   text (headings, paragraphs, links, breadcrumbs) renders in white on top.
//   No image in index.md → index.html just falls back to the normal look.
//
// - research.html: now a full-viewport version of the graph (no sidebar
//   taking up space). Nav/search/theme/Random Note live in a small blurred
//   floating window top-left; zoom/fit/pause controls top-right; folder
//   legend bottom-left.
//
// - Breadcrumbs: "Research Topics" / "Book Reviews" / "Blog Notes" / "Seeds"
//   segments are now clickable links to their section page. Deeper
//   subfolders (which have no page of their own) stay plain text.
//
// - Internal note links (both [[wikilinks]] and any <a href="note.html">
//   inside an article) now open in a popup modal instead of navigating away
//   — same pattern as Quartz/Obsidian Publish hover previews. Esc or
//   clicking outside closes it; "Відкрити повністю ↗" jumps to the full page.
//
// - Plain blockquotes (a ">" quote with NO [!type] callout syntax) now get
//   a simple rainbow line on the left, no box — separate from the fuller
//   callout treatment, which still works exactly as before.
//
// - Dark theme background is a neutral #0e0e0e instead of pure #000.

