# Sasha's Garden — як влаштований цей репозиторій

**Це НЕ Quartz.** Сайт збирається власним скриптом `build.js` (Node.js, `marked` + `gray-matter`).
Стара копія Quartz була на гілці `v5`; вона більше не використовується і збережена лише як архів у гілці `archive/quartz-v5`. Не відновлюй її і не пропонуй Quartz-рішень.

## Як це працює
- Робоча гілка: **`main`**.
- `build.js` читає нотатки з локального Obsidian-сховища (`VAULT` = `/Users/dnaroxela/Documents/Obsidian Vault`) і генерує статичні HTML-сторінки в `docs/`.
- Самих Markdown-нотаток у репозиторії немає — лише згенерований `docs/`. Тому повністю перезібрати сайт можна тільки на Mac власниці: `node build.js`, потім commit і push у `main`.
- `.github/workflows/deploy.yml` при push у `main` публікує папку `docs/` на GitHub Pages: https://dnaroxela-cpu.github.io/garden/
- Портфоліо живе окремо: https://dnaroxela.xyz

## Структура сайту (див. `SECTION_PAGES` / `SECTION_LABELS` у `build.js`)
- `index.html` — головна з графом (папка сховища «Research Topics», підпис «Map of Inquiry»)
- `books.html` — Book Reviews (обкладинки, фільтри)
- `blog.html` — Blog Notes
- `seeds.html` — Seeds
- `tag-*.html` — сторінки тегів
- Решта `*.html` — окремі нотатки (наприклад `цифровий-сад.html` — стаття про цифрові сади)

## Під час змін
- Дизайн (CSS) і шаблони сторінок — у функції `template()` в `build.js`.
- Змінюючи лише `build.js`, пам'ятай: `docs/` оновиться тільки після локального запуску `node build.js`.
