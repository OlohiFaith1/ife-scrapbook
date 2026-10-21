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
npm run texture   # optional: regenerates the procedural paper texture
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
| `npm run texture`  | Regenerate the procedural paper texture (deterministic)            |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                               |

## Texture

`public/texture/wall-texture.webp` is a seamless paper tile generated entirely in code
by `scripts/build-texture.mjs` (seeded, so it is reproducible). It is original work and
is the only file in `public/texture/` that git tracks.

The Figma layer's own texture (`425379127320117182 1`, a photo of a blue spray-painted
canvas) has **unverified rights**. It lives only in `assets-src/` and in the Figma
reference renders in `tests/reference/`. Both are gitignored, nothing in the build uses
them, and they must not be committed or deployed.

## Measurements

All sizes in `src/styles.css` are Figma px × `--u`, where the 1440×1024 frame is scaled
to fit the viewport — at 1440×1024 the site renders 1:1 with the Figma frames.
