import { rm } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

// public/ also holds the full-size page exports (Page 1–19.png, Page 20/End.png)
// that `npm run images` reads. The site only loads public/pages/*.webp, so the
// sources are removed from the build output after Vite copies public/ into it.
// Only these exact names, and only inside the build's outDir, are touched.
const SOURCE_EXPORTS = [...Array.from({ length: 19 }, (_, i) => `Page ${i + 1}.png`), 'Page 20'];

function dropSourceExports() {
  let outDir = '';
  return {
    name: 'drop-source-exports',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (const name of SOURCE_EXPORTS) await rm(path.join(outDir, name), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [dropSourceExports()],
});
