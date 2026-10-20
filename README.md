# The Lapo Files — website

Built from the Figma file `playground`:

- **Screen 1** — `Desktop - 1` (58:93): the question on cobalt blue.
- **Screen 2** — `Desktop - 2` (58:98): the scrapbook on the cream surface.

Status: **Milestone 1** (branch `milestone-1`). Screen 1 → 3 s → crossfade to Screen 2 →
closed cover → click / Enter / Space / → opens the cover onto the static 01 | 02 spread.
Page turning (M2), zoom and small-screen layouts are not built yet.

## Run it

```sh
npm install
npm run texture   # once: builds public/texture from assets-src (see below)
npm run dev
```

## Scripts

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `npm run dev`      | Local dev server                                                    |
| `npm run build`    | Type-check and build into `dist/`                                   |
| `npm run preview`  | Serve the build (http://localhost:4173)                             |
| `npm run compare`  | Diff the running preview against the Figma renders + flow checks   |
| `npm run images`   | Regenerate page WebPs from `~/Desktop/ife's scrapbook` (read-only)  |
| `npm run texture`  | Regenerate the background texture from `assets-src/`               |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                               |

## ⚠️ Texture — local use only

The background texture is the image fill of Figma layer `425379127320117182 1`
(a photo of a blue spray-painted canvas). Its rights are **unverified**, so
`assets-src/`, `public/texture/` and the Figma reference renders in `tests/reference/`
are gitignored. Because `vite build` copies `public/` into `dist/`, **do not deploy
`dist/`** until the texture's source and licence are confirmed.

## Measurements

All sizes in `src/styles.css` are Figma px × `--u`, where the 1440×1024 frame is scaled
to fit the viewport — at 1440×1024 the site renders 1:1 with the Figma frames.
