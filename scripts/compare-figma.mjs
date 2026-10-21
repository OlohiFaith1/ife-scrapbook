// Milestone 1 review: captures the live site at the Figma reference size and
// diffs it against renders of the Figma frames, plus flow checks.
//
//   npm run build && npm run preview      # in one terminal
//   npm run compare                       # in another
//
// References (gitignored; they contain the texture):
//   tests/reference/desktop-1.png — Desktop - 1 (58:93)
//   tests/reference/desktop-2.png — Desktop - 2 (58:98)
// Output: tests/output/*.png (captures, diff heatmaps, opening frames)

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.SITE_URL ?? 'http://localhost:4173/';
const out = path.join(root, 'tests', 'output');
const ref = (name) => path.join(root, 'tests', 'reference', name);
await mkdir(out, { recursive: true });

const W = 1440;
const H = 1024;

// Regions in Figma px, used to report where differences are.
const REGIONS = {
  'desktop-1': {
    question: { left: 343, top: 228, width: 754, height: 483 },
    credit: { left: 620, top: 945, width: 200, height: 30 },
    background: { left: 0, top: 0, width: 300, height: 1024 },
  },
  'desktop-2': {
    'left page (01)': { left: 235, top: 176, width: 475, height: 672 },
    'right page (02)': { left: 729, top: 176, width: 475, height: 672 },
    'blue board': { left: 225, top: 162, width: 989, height: 14 },
    spine: { left: 709, top: 176, width: 20, height: 672 },
    credit: { left: 620, top: 945, width: 200, height: 30 },
    background: { left: 0, top: 0, width: 220, height: 1024 },
  },
};

async function raw(input, region) {
  let img = sharp(input).removeAlpha();
  if (region) img = img.extract(region);
  return img.raw().toBuffer({ resolveWithObject: true });
}

/** Mean absolute error (0–255) and share of pixels differing by > 32 on any channel. */
async function diff(actual, reference, region) {
  const a = await raw(actual, region);
  const b = await raw(reference, region);
  let sum = 0;
  let over = 0;
  const n = a.info.width * a.info.height;
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c]);
      sum += d;
      if (d > worst) worst = d;
    }
    if (worst > 32) over++;
  }
  return { mae: sum / (n * 3), over: over / n };
}

async function heatmap(actual, reference, file) {
  const a = await raw(actual);
  const b = await raw(reference);
  const px = Buffer.alloc(a.info.width * a.info.height * 3);
  for (let i = 0; i < a.info.width * a.info.height; i++) {
    const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c])));
    const v = Math.min(255, d * 3);
    px[i * 3] = v;
    px[i * 3 + 1] = v * 0.2;
    px[i * 3 + 2] = 255 - v;
  }
  await sharp(px, { raw: { width: a.info.width, height: a.info.height, channels: 3 } }).png().toFile(file);
}

async function report(name, actual) {
  const reference = ref(`${name}.png`);
  const overall = await diff(actual, reference);
  console.log(`\n${name} vs Figma — overall: mean error ${overall.mae.toFixed(2)}/255, ${(overall.over * 100).toFixed(2)}% of pixels differ noticeably`);
  for (const [label, region] of Object.entries(REGIONS[name])) {
    const r = await diff(actual, reference, region);
    console.log(`  ${label.padEnd(16)} mean ${r.mae.toFixed(2)}  noticeable ${(r.over * 100).toFixed(2)}%`);
  }
  await heatmap(actual, reference, path.join(out, `${name}-diff.png`));
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};
const stateOf = (page) => page.$eval('.experience', (el) => el.dataset.state);
/** The cover leaf's artwork: loaded, opaque, and the cover export on the front. */
const coverShown = (page) =>
  page.$$eval('.leaf img', (els) =>
    els.every((e) => e.complete && e.naturalWidth > 0 && getComputedStyle(e).opacity === '1') &&
    els.map((e) => e.dataset.page).join() === 'cover,01',
  );

// ── Reference size, full motion ────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  // Record when each state begins, measured inside the page.
  await page.addInitScript(() => {
    window.__states = [];
    new MutationObserver(() => {
      const el = document.querySelector('.experience');
      window.__states.push([el.dataset.state, performance.now()]);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'question');
  await page.waitForTimeout(300);
  const screen1 = path.join(out, 'screen-1.png');
  await page.screenshot({ path: screen1 });
  const lines = await page.$eval('.question', (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
  });
  check(lines === 3, `question renders on three lines (${lines})`);

  // Auto-advance after 3 s, with no input.
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'crossfade', null, { timeout: 6000 });
  const held = await page.evaluate(() => {
    const at = (name) => window.__states.find(([s]) => s === name)[1];
    return Math.round(at('crossfade') - at('question'));
  });
  check(held > 2700 && held < 4200, `Screen 1 holds ~3 s before the crossfade (${held} ms)`);
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'closed');
  await page.waitForTimeout(200);
  const closed = path.join(out, 'screen-2-closed.png');
  await page.screenshot({ path: closed });

  const coverBox = await page.$eval('.leaf', (el) => el.getBoundingClientRect().toJSON());
  const coverCentre = coverBox.x + coverBox.width / 2;
  check(Math.abs(coverCentre - W / 2) < 1.5, `closed cover is centred (centre at ${coverCentre.toFixed(1)}px)`);
  check(await coverShown(page), `closed book shows the cover artwork (and page 01 on its back)`);

  // Open by clicking the cover; record frames of the swing for review.
  await page.click('.leaf');
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const f = path.join(out, `opening-${i}.png`);
    await page.screenshot({ path: f });
    frames.push(f);
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'open', null, { timeout: 4000 });
  await page.waitForTimeout(300);
  const spread = path.join(out, 'screen-2-open.png');
  await page.screenshot({ path: spread });

  const geometry = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
    return { book: r('.book'), left: r('.book > .board--left .page'), right: r('.book > .board--right .page') };
  });
  const near = (a, b) => Math.abs(a - b) < 0.75;
  check(
    near(geometry.book.x, 225) && near(geometry.book.y, 162) && near(geometry.book.width, 989.05) && near(geometry.book.height, 700),
    `book settles at Figma 225,162 989×700 (${geometry.book.x.toFixed(2)},${geometry.book.y.toFixed(2)} ${geometry.book.width.toFixed(2)}×${geometry.book.height.toFixed(2)})`,
  );
  check(
    near(geometry.left.width, 474.99) && near(geometry.left.height, 672.17) && near(geometry.right.x - (geometry.left.x + geometry.left.width), 19.53),
    `pages 475×672 with a 19.5px spine (${geometry.left.width.toFixed(2)}×${geometry.left.height.toFixed(2)}, spine ${(geometry.right.x - geometry.left.x - geometry.left.width).toFixed(2)})`,
  );
  const order = await page.$$eval('.book > .board .page.is-current', (els) => els.map((e) => e.dataset.page));
  check(order.join() === '01,02', `open spread is 01 | 02 (${order.join(' | ')})`);

  await report('desktop-1', screen1);
  await report('desktop-2', spread);

  // A strip of the opening frames for review.
  const thumbs = await Promise.all(frames.map((f) => sharp(f).resize(480).toBuffer()));
  await sharp({ create: { width: 480 * 4, height: 342 * 2, channels: 3, background: '#fff' } })
    .composite(thumbs.map((input, i) => ({ input, left: (i % 4) * 480, top: Math.floor(i / 4) * 342 })))
    .png()
    .toFile(path.join(out, 'opening-strip.png'));

  check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
  await context.close();
}

// ── Skip with a key, open with the keyboard ───────────────────
{
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'question');
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state !== 'question');
  check(Date.now() - t0 < 1500, `a keypress skips the 3 s wait`);
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'closed');
  await page.keyboard.press('Enter');
  check((await stateOf(page)) === 'opening', `Enter opens the cover`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'open');
  check(true, `extra input during the swing is ignored and the book still settles open`);
  await context.close();
}

// ── Page navigation and both ways back to the cover ───────────
const waitState = (page, s, timeout = 5000) =>
  page.waitForFunction((s) => document.querySelector('.experience').dataset.state === s, s, { timeout });
const spreadOf = (page) =>
  page.$$eval('.book > .board .page.is-current', (els) => els.map((e) => e.dataset.page).join('|'));
const EXPECTED = Array.from({ length: 10 }, (_, i) => `${String(2 * i + 1).padStart(2, '0')}|${String(2 * i + 2).padStart(2, '0')}`);

async function toOpenBook(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitState(page, 'question');
  await page.keyboard.press('Space');
  await waitState(page, 'closed');
  await page.click('.leaf');
  await waitState(page, 'open');
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  const tag = reducedMotion === 'reduce' ? 'reduced motion: ' : '';
  const context = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toOpenBook(page);

  const spiral = () => page.$eval('.spiral', (el) => el.getBoundingClientRect().toJSON());
  const spiralBefore = await spiral();
  check(
    (await page.$eval('.spiral-slot', (el) => getComputedStyle(el).pointerEvents)) === 'none',
    `${tag}spiral is drawn and never takes clicks`,
  );

  // Right page forwards through every spread.
  const seen = [await spreadOf(page)];
  for (let i = 1; i < EXPECTED.length; i++) {
    await page.click('.book > .board--right');
    await waitState(page, 'open');
    seen.push(await spreadOf(page));
  }
  check(seen.join() === EXPECTED.join(), `${tag}right page steps through ${seen.join(', ')}`);
  const s = await spiral();
  check(Math.abs(s.x - spiralBefore.x) < 0.5 && Math.abs(s.y - spiralBefore.y) < 0.5, `${tag}spiral stays fixed while pages turn`);

  const a11y = await page.evaluate(() => ({
    live: document.querySelector('[data-live]').textContent,
    right: document.querySelector('[data-side="right"]').getAttribute('aria-label'),
    left: document.querySelector('[data-side="left"]').getAttribute('aria-label'),
    alts: [...document.querySelectorAll('.book > .board .page.is-current')].map((e) => e.alt.split(':')[0]).join('|'),
    hidden: [...document.querySelectorAll('.book > .board .page:not(.is-current)')].every((e) => e.getAttribute('aria-hidden') === 'true' && e.alt === ''),
  }));
  check(
    a11y.live === 'Pages 19 and 20.' && a11y.alts === 'Page 19|Page 20' && a11y.hidden && a11y.right === 'Close the scrapbook' && a11y.left === 'Previous: pages 17 and 18',
    `${tag}labels, alt text, aria-hidden and live region follow the spread (${JSON.stringify(a11y)})`,
  );

  // Left page / ArrowLeft goes back one spread.
  await page.click('.book > .board--left');
  await waitState(page, 'open');
  check((await spreadOf(page)) === '17|18', `${tag}left page goes back to 17|18`);
  await page.keyboard.press('ArrowRight');
  await waitState(page, 'open');
  check((await spreadOf(page)) === '19|20', `${tag}ArrowRight goes forward to 19|20`);

  // 19|20 → right page → cover, with 01|02 restored underneath.
  await page.click('.book > .board--right');
  await waitState(page, 'closed');
  check(
    (await spreadOf(page)) === '01|02' && (await page.$eval('[data-live]', (e) => e.textContent)) === 'The scrapbook cover.',
    `${tag}19|20 right page returns to the cover`,
  );
  await page.waitForTimeout(400);
  check(await coverShown(page), `${tag}cover artwork is shown after returning from 19|20`);
  await page.click('.leaf');
  await waitState(page, 'open');
  check((await spreadOf(page)) === '01|02', `${tag}reopening after 19|20 shows 01|02`);

  // Rapid repeated clicks advance exactly one spread.
  await page.click('.book > .board--right');
  await page.click('.book > .board--right', { force: true }).catch(() => {});
  await page.keyboard.press('ArrowRight');
  await waitState(page, 'open');
  await page.waitForTimeout(400);
  check((await spreadOf(page)) === '03|04', `${tag}repeated input during a turn doesn't skip spreads (${await spreadOf(page)})`);

  // 01|02 → left page → the cover swings shut.
  await page.keyboard.press('ArrowLeft');
  await waitState(page, 'open');
  const states = [];
  await page.exposeFunction('__recordState', (st) => states.push(st));
  await page.evaluate(() => {
    // Records are batched, so log each change's previous value.
    new MutationObserver((records) => records.forEach((r) => window.__recordState(r.oldValue))).observe(
      document.querySelector('.experience'),
      { attributes: true, attributeOldValue: true, attributeFilter: ['data-state'] },
    );
  });
  await page.click('.book > .board--left');
  await page.waitForTimeout(500);
  const midSwing = await page.$eval('.leaf', (el) => getComputedStyle(el).rotate);
  await waitState(page, 'closed');
  check(
    (await page.$eval('.leaf', (el) => getComputedStyle(el).display)) !== 'none' && !(await page.$eval('.leaf', (el) => el.inert)),
    `${tag}01|02 left page returns to the cover (${[...states, 'closed'].join(' → ')})`,
  );
  if (!tag) {
    check(
      states.join() === 'open,closing-start,closing' && midSwing !== 'none' && !midSwing.includes('-180'),
      `the cover swings shut (rotate mid-swing: ${midSwing})`,
    );
  }
  check(await coverShown(page), `${tag}cover artwork is shown after returning from 01|02`);
  await page.click('.leaf');
  await waitState(page, 'open');
  check((await spreadOf(page)) === '01|02', `${tag}the cover opens again onto 01|02`);

  check(errors.length === 0, `${tag}no page errors ${errors.join(' | ')}`);
  await context.close();
}

// ── Click sounds ───────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Count audio contexts and every sound actually started, named by its length.
  await page.addInitScript(() => {
    window.__contexts = 0;
    window.__sounds = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        window.__contexts++;
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const d = this.buffer?.duration ?? 0;
      window.__sounds.push(d > 0.45 ? 'cover' : d > 0.2 ? 'page' : 'tap');
      return start.apply(this, args);
    };
  });
  const sounds = () => page.evaluate(() => window.__sounds.join());
  const soundsBecome = (list) =>
    page.waitForFunction((list) => window.__sounds.join() === list, list, { timeout: 2000 }).then(() => true, () => false);

  await page.goto(url, { waitUntil: 'networkidle' });
  const served = await page.evaluate(() =>
    Promise.all(['tap', 'page', 'cover'].map((n) => fetch(`/sounds/${n}.wav`).then((r) => `${r.status} ${r.headers.get('content-type')}`))),
  );
  check(served.every((s) => s.startsWith('200 audio/')), `sound files are served locally (${served.join(', ')})`);

  // Let Screen 1 auto-advance with no input at all: no audio may start.
  await waitState(page, 'closed', 8000);
  check(
    (await page.evaluate(() => window.__contexts)) === 0 && (await sounds()) === '',
    `no audio before the visitor interacts`,
  );

  await page.click('.leaf');
  check(await soundsBecome('cover'), `opening the cover plays the cover sound once (${await sounds()})`);
  await waitState(page, 'open');

  // One page sound per accepted turn; extra input mid-turn stays silent.
  await page.click('.book > .board--right');
  await page.click('.book > .board--right', { force: true }).catch(() => {});
  await page.keyboard.press('ArrowRight');
  await waitState(page, 'open');
  await page.waitForTimeout(300);
  check((await sounds()) === 'cover,page', `a turn plays one page sound, repeated input adds none (${await sounds()})`);

  await page.keyboard.press('ArrowLeft');
  check(await soundsBecome('cover,page,page'), `keyboard turns play the page sound`);
  await waitState(page, 'open');
  await page.click('.book > .board--left');
  check(await soundsBecome('cover,page,page,cover'), `returning to the cover plays the cover sound`);
  await waitState(page, 'closed');

  // Footer links: one soft tap each (navigation blocked for the test).
  await page.evaluate(() => document.addEventListener('click', (e) => e.target.closest('a') && e.preventDefault(), true));
  await page.click('.screen--book .credit__link >> nth=0');
  check(await soundsBecome('cover,page,page,cover,tap'), `clicking “Snow” plays one tap`);
  await page.waitForTimeout(150);
  await page.click('.screen--book .credit__link >> nth=1');
  check(await soundsBecome('cover,page,page,cover,tap,tap'), `clicking “Ife” plays one tap`);
  await page.hover('.screen--book .credit__link >> nth=0');
  await page.waitForTimeout(200);
  check((await sounds()).split(',').length === 6 && (await stateOf(page)) === 'closed', `hover is silent and the book is undisturbed`);

  check(errors.length === 0, `sounds: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// ── Reduced motion ─────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'question');
  await page.mouse.click(10, 10);
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'closed');
  await page.click('.leaf');
  check((await stateOf(page)) === 'open', `reduced motion: cover opens without the swing`);
  const rotate = await page.$eval('.leaf', (el) => getComputedStyle(el).transitionProperty);
  check(!rotate.includes('rotate') || rotate === 'all', `reduced motion: no rotate transition (${rotate})`);
  await context.close();
}

// ── Other desktop sizes: proportional scaling ─────────────────
for (const [w, h] of [
  [1280, 800],
  [1920, 1080],
]) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'question');
  await page.screenshot({ path: path.join(out, `screen-1-${w}x${h}.png`) });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'closed');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.experience').dataset.state === 'open');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, `screen-2-open-${w}x${h}.png`) });
  const box = await page.$eval('.book', (el) => el.getBoundingClientRect().toJSON());
  const u = Math.min(w / 1440, h / 1024);
  check(
    Math.abs(box.width - 989.05 * u) < 1 && Math.abs(box.x + box.width / 2 - w / 2) < 1 && Math.abs(box.y + box.height / 2 - h / 2) < 1,
    `${w}×${h}: book scales ×${u.toFixed(3)} and stays centred`,
  );
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
