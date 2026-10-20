# The Lapo Files — scrapbook site

The 21 scrapbook slides (cover + pages 01–20) laid out as paper on a cream table.
Click or tap any page to pick it up; turn pages with the arrows, ← →, or a swipe;
click/tap the page (or press Z) to zoom in and read the small type.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `npm run dev`        | Local dev server                                                     |
| `npm run build`      | Type-check and build the static site into `dist/`                    |
| `npm run preview`    | Serve the built site (http://localhost:4173)                         |
| `npm run lint`       | ESLint                                                               |
| `npm run typecheck`  | TypeScript                                                           |
| `npm run images`     | Regenerate the WebP copies from the original exports                 |
| `npm run test:smoke` | Headless-Chrome checks against `npm run preview` (layout, viewer, a11y, reduced motion) |

## Images

The originals in `~/Desktop/ife's scrapbook/` are only ever **read**. `npm run images`
writes resized WebP copies to `public/pages/` (480, 800, 1200, 1800 and 3000px wide)
plus `src/data/pages.generated.json` (dimensions and a placeholder colour per page).
Existing outputs are skipped; add `-- --force` to redo them, or set `SCRAPBOOK_SRC`
to read from a different folder.

The table loads 480–1200px previews lazily; the viewer loads 1800px copies, and 3000px
only when zoomed.

## Where things live

- `src/layout.ts`: where each page sits on the table (desktop and phone compositions)
- `src/pages.ts`: page titles and alt text
- `src/table.ts`: renders the table and the settle-in entrance
- `src/viewer.ts`: the full-screen page viewer (open/close lift, swipe, zoom, keyboard)
- `src/styles.css`: paper surface, shadows, motion and reduced-motion rules
