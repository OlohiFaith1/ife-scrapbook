// Generates optimised WebP copies of the original scrapbook exports.
// The source folder is only ever read; every output goes into this project.
//
//   npm run images                     # uses ~/Desktop/ife's scrapbook
//   SCRAPBOOK_SRC=/path npm run images # custom source folder
//   npm run images -- --force          # regenerate even if outputs exist

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.resolve(process.env.SCRAPBOOK_SRC ?? path.join(homedir(), 'Desktop', "ife's scrapbook"));
const outDir = path.join(root, 'public', 'pages');
const manifestPath = path.join(root, 'src', 'data', 'pages.generated.json');
const force = process.argv.includes('--force');

// Widths used by the table previews (480–1200) and the viewer (1800–3000).
export const WIDTHS = [480, 800, 1200, 1800, 3000];

const SOURCES = ['COVER', ...Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'))];

if (outDir.startsWith(sourceDir + path.sep) || outDir === sourceDir) {
  throw new Error('Refusing to write inside the original exports folder.');
}

const exists = async (p) => stat(p).then(() => true, () => false);

await mkdir(outDir, { recursive: true });
await mkdir(path.dirname(manifestPath), { recursive: true });

const manifest = [];

for (const name of SOURCES) {
  const input = path.join(sourceDir, `${name}.png`);
  const slug = name.toLowerCase();
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

  manifest.push({ slug, width: meta.width, height: meta.height, color });
  console.log(`✓ ${name}`);
}

await writeFile(manifestPath, JSON.stringify({ widths: WIDTHS, pages: manifest }, null, 2) + '\n');
console.log(`\nWrote ${manifest.length} pages → public/pages, manifest → src/data/pages.generated.json`);
