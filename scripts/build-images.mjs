// Generates optimised WebP copies of the scrapbook artwork.
// Source files are only ever read, never renamed or modified; every output
// goes into public/pages/ of this project.
//
//   npm run images                # skips outputs that already exist
//   npm run images -- --force     # regenerate everything

import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'pages');
const manifestPath = path.join(root, 'src', 'data', 'pages.generated.json');
const force = process.argv.includes('--force');

// Widths used by the book (800–1200) and, later, zoom (1800–3000).
export const WIDTHS = [480, 800, 1200, 1800, 3000];

// Explicit page → source mapping (confirmed by the author). The cover is the
// original export; pages 01–20 are the newer exports kept in this project.
const exports = path.join(homedir(), 'Desktop', "ife's scrapbook");
const SOURCES = [
  { slug: 'cover', file: path.join(exports, 'COVER.png') },
  ...Array.from({ length: 19 }, (_, i) => ({
    slug: String(i + 1).padStart(2, '0'),
    file: path.join(root, 'public', `Page ${i + 1}.png`),
  })),
  { slug: '20', file: path.join(root, 'public', 'Page 20', 'End.png') },
];

const exists = async (p) => stat(p).then(() => true, () => false);

// Never write into the original exports folder (symlinks resolved).
const real = (p) => realpath(p).catch(() => path.resolve(p));
const exportsReal = await real(exports);
for (const target of [outDir, path.dirname(manifestPath)]) {
  const rel = path.relative(exportsReal, await real(target));
  if (rel === '' || !(rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`Refusing to write inside the original exports folder: ${target}`);
  }
}

const missing = [];
for (const { file } of SOURCES) if (!(await exists(file))) missing.push(file);
if (missing.length) throw new Error(`Missing source images:\n  ${missing.join('\n  ')}`);

await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(manifestPath), { recursive: true });

const manifest = [];

for (const { slug, file: input } of SOURCES) {
  const name = path.relative(path.dirname(root), input);
  // failOn 'none' + read-only access: sharp never writes back to the input.
  const image = sharp(input, { limitInputPixels: false, failOn: 'none' });
  const meta = await image.metadata();

  // Average colour becomes the paper tone shown while a preview loads.
  const { dominant } = await image.clone().resize(64).stats();
  const color = `rgb(${dominant.r} ${dominant.g} ${dominant.b})`;

  for (const width of WIDTHS) {
    const file = path.join(outDir, `${slug}-${width}.webp`);
    if (!force && (await exists(file))) continue;
    await image
      .clone()
      .resize({ width, kernel: 'lanczos3' })
      .webp({ quality: width >= 1800 ? 86 : 80, smartSubsample: true, effort: 5 })
      .toFile(file);
    process.stdout.write(`  ${slug}-${width}.webp\n`);
  }

  manifest.push({ slug, source: name, width: meta.width, height: meta.height, color });
  console.log(`✓ ${name}`);
}

await writeFile(manifestPath, JSON.stringify({ widths: WIDTHS, pages: manifest }, null, 2) + '\n');
console.log(`\nWrote ${manifest.length} pages → public/pages, manifest → src/data/pages.generated.json`);
