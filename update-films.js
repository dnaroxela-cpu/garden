// Weekly GitHub Action (.github/workflows/deploy.yml): refresh the «Фільми» tab from MUBI without rebuilding the vault.
// Updates docs/films.json and the films data inside docs/index.html; everything else stays as built on the Mac.
const fs = require('fs');
const path = require('path');
const { resolveFilms, visibleFilms } = require('./films');

(async () => {
  const OUT = path.join(__dirname, 'docs');
  const films = await resolveFilms(OUT);
  const file = path.join(OUT, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const re = /(<script type="application\/json" id="films-data">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) { console.log('🎬 docs/index.html has no films block yet, skipping'); return; }
  const json = JSON.stringify(visibleFilms(films)).replace(/<\//g, '<\\/');
  fs.writeFileSync(file, html.replace(re, (m, a, b) => a + json + b));
})();
