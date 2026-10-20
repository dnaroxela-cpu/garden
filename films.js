const fs = require('fs');
const path = require('path');
const { wikiLookup, pool } = require('./wiki');

// Films for the «Фільми» tab of the shelf: ratings from MUBI (https://mubi.com/en/users/<id>), fetched on every build and kept in docs/films.json,
// so if MUBI can't be reached the last list stays on the site.
// Used by build.js and by update-films.js (the weekly GitHub Action). Poster: MUBI's vertical artwork, else the iTunes store, else a still.
// Genres come from Wikipedia/Wikidata, which also tells films from TV series: series rated on MUBI stay in films.json
// (so they aren't looked up again) but are left out of the site, see visibleFilms.
const MUBI_USER = process.env.MUBI_USER || '6777405';
async function mubiRatings(user) {
  const headers = { CLIENT: 'web', CLIENT_COUNTRY: process.env.MUBI_COUNTRY || 'US', Accept: 'application/json' };
  const all = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const url = `https://api.mubi.com/v4/users/${user}/ratings?per_page=100${cursor ? `&before=${cursor}` : ''}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`MUBI ${res.status}`);
    const d = await res.json();
    const page = d.ratings || [];
    all.push(...page);
    cursor = d.meta && d.meta.next_cursor;
    if (!page.length || !cursor || (d.meta.total_count && all.length >= d.meta.total_count)) break;
  }
  return all;
}
async function itunesPoster(title, year) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=movie&entity=movie&limit=5&term=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(10000) });
    const d = await res.json();
    const hit = (d.results || []).find(r => !year || String(r.releaseDate || '').startsWith(String(year))) || (d.results || [])[0];
    return hit && hit.artworkUrl100 ? hit.artworkUrl100.replace(/100x100bb/, '600x600bb') : null;
  } catch { return null; }
}
async function resolveFilms(OUT) {
  const FILE = path.join(OUT, 'films.json');
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  let ratings;
  try { ratings = await mubiRatings(MUBI_USER); }
  catch (e) { console.log('🎬 MUBI недоступний, лишаю попередній список фільмів:', e.message); return prev; }
  if (!ratings.length && prev.length) { console.log('🎬 MUBI повернув порожній список, лишаю попередній'); return prev; }
  const known = new Map(prev.map(f => [f.id, f]));
  const films = [];
  for (const r of ratings) {
    const f = r.film || {};
    if (!f.title) continue;
    const old = known.get(f.id);
    const art = (f.artworks || []).find(a => /vertical|poster/i.test(a.format || '') && a.image_url);
    let cover = art ? art.image_url : (old && old.cover);
    if (!cover) cover = await itunesPoster(f.title, f.year) || f.still_url || (f.stills && (f.stills.retina || f.stills.medium)) || null;
    films.push({
      id: f.id, title: f.title, year: f.year || null,
      directors: (f.directors || []).map(x => x.name).filter(Boolean),
      rating: r.overall || null, date: (r.updated_at || r.created_at || '').slice(0, 10) || null,
      url: f.web_url || null, cover,
      series: !!(f.series || f.episode || f.is_series) || (old ? !!old.series : false),
      genres: old && old.genres || [], wiki: !!(old && old.wiki),
    });
  }
  const todo = films.filter(f => !f.wiki);
  if (todo.length) console.log(`🎬 шукаю жанри у Вікіпедії для ${todo.length} фільмів...`);
  let failed = 0;
  await pool(todo, 4, async f => {
    try {
      const w = await wikiLookup(f.title, f.year, 'film');
      if (w) { f.genres = w.genres; if (w.kind === 'series') f.series = true; }
      f.wiki = true; // found or not, don't ask again; a network error leaves it for the next build
    } catch { failed++; }
  });
  if (failed) console.log(`🎬 Вікіпедія не відповіла для ${failed} фільмів, спробую наступного разу`);
  fs.writeFileSync(FILE, JSON.stringify(films));
  console.log(`🎬 фільмів з MUBI: ${films.length}`);
  return films;
}

const visibleFilms = films => films.filter(f => !f.series);

module.exports = { resolveFilms, visibleFilms };
