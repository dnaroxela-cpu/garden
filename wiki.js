// Genres and "is this a film or a TV series?" from Wikipedia/Wikidata.
// Wikipedia search finds the article, its Wikidata item gives instance of (P31), genre (P136) and publication date (P577).
// Used for films (MUBI) and for series from the «Серіали» note.
const UA = { 'User-Agent': 'SashasGarden/1.0 (https://dnaroxela-cpu.github.io/garden/)', 'Api-User-Agent': 'SashasGarden/1.0' };
const FILM = new Set(['Q11424', 'Q24869', 'Q29168811', 'Q202866', 'Q93204', 'Q24862', 'Q506240', 'Q226730', 'Q17517379', 'Q1054574']);
const SERIES = new Set(['Q5398426', 'Q1259759', 'Q15416', 'Q581714', 'Q526877', 'Q3464665', 'Q21191270', 'Q1366112', 'Q117467246', 'Q63952888', 'Q7725310']);

// Wikimedia answers 429 when asked too often: requests go one at a time, at most ~5 a second, and a 429/5xx is retried after a pause
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function getJSON(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 200 - Date.now();
    last = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (res.ok) return res.json();
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await sleep((+res.headers.get('retry-after') || 2 ** attempt * 2) * 1000);
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
}
const ids = (claims, p) => ((claims && claims[p]) || []).map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value)
  .filter(Boolean).map(v => v.id || v.time).filter(Boolean);
const kindOf = claims => {
  const p31 = ids(claims, 'P31');
  return p31.some(id => SERIES.has(id)) ? 'series' : p31.some(id => FILM.has(id)) ? 'film' : null;
};
const cleanGenre = g => g.toLowerCase()
  .replace(/\s+(film|movie|television series|television program|television|tv series|series|fiction)$/, '').trim();
const SKIP_GENRE = new Set(['fiction', 'independent', 'lgbt-related', 'lgbtq-related', 'drama television', 'film', 'television']);

// Returns { kind: 'film'|'series'|null, genres: [...] }, or null when Wikipedia has no matching article.
// Throws when Wikipedia can't be reached, so the caller can try again on the next build.
async function wikiLookup(title, year, want) {
  const q = `${title}${year ? ' ' + year : ''} ${want === 'series' ? 'TV series' : 'film'}`;
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&gsrsearch=${encodeURIComponent(q)}&prop=pageprops&ppprop=wikibase_item`);
  const pages = Object.values((s.query && s.query.pages) || {}).sort((a, b) => a.index - b.index);
  const qids = pages.map(p => p.pageprops && p.pageprops.wikibase_item).filter(Boolean);
  if (!qids.length) return null;
  const e = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${qids.join('|')}`);
  const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const candidates = qids.map((id, i) => {
    const claims = (e.entities[id] || {}).claims || {};
    const kind = kindOf(claims);
    const y = ids(claims, 'P577').concat(ids(claims, 'P580')).map(t => +String(t).slice(1, 5)).filter(Boolean);
    const page = pages.find(p => p.pageprops && p.pageprops.wikibase_item === id);
    const sameYear = !!year && y.some(v => Math.abs(v - year) <= 1);
    const sameTitle = !!page && norm(page.title.replace(/\s*\(.*\)$/, '')) === norm(title);
    const score = (kind === want ? 5 : 0) + (sameYear ? 8 : 0) + (sameTitle ? 6 : 0) - i;
    return { id, kind, claims, score, sure: sameTitle || (sameYear && i < 2) };
  }).filter(c => c.kind && c.sure); // only a film/series whose title or year matches
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  const gids = ids(best.claims, 'P136').slice(0, 6);
  let genres = [];
  if (gids.length) {
    const l = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${gids.join('|')}`);
    genres = [...new Set(gids.map(g => l.entities[g] && l.entities[g].labels.en && cleanGenre(l.entities[g].labels.en.value)).filter(g => g && !SKIP_GENRE.has(g)))];
  }
  return { kind: best.kind, genres };
}

// run fn over items, a few at a time
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// tidy genres already stored (older builds kept labels like "horror fiction" or "independent")
const tidyGenres = gs => [...new Set((gs || []).map(cleanGenre).filter(g => g && !SKIP_GENRE.has(g)))];

module.exports = { wikiLookup, pool, tidyGenres };
