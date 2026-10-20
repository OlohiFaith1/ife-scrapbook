// Browser smoke test using the locally installed Google Chrome (headless).
//
//   npm run build && npm run preview   # in one terminal
//   npm run test:smoke                 # in another
//
// SITE_URL overrides the address; SHOTS=/some/dir saves screenshots.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.SITE_URL ?? 'http://localhost:4173/';
const shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'phone-360', width: 360, height: 740, touch: true },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

const state = (page) =>
  page.evaluate(() => ({
    open: document.querySelector('dialog.viewer').open,
    count: document.querySelector('[data-count]').textContent,
    zoomed: document.querySelector('dialog.viewer').classList.contains('is-zoomed'),
    focused: document.activeElement?.dataset?.index ?? document.activeElement?.tagName,
  }));

const settle = (page, ms = 700) => page.waitForTimeout(ms);

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: !!vp.touch,
    isMobile: !!vp.touch && vp.width < 700,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const images = new Set();
  let imageBytes = 0;
  page.on('response', async (r) => {
    if (!r.url().endsWith('.webp')) return;
    images.add(path.basename(r.url()));
    imageBytes += (await r.body().catch(() => Buffer.alloc(0))).length;
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await settle(page, 1500);
  console.log(`\n— ${vp.name} (${vp.width}×${vp.height})`);

  const initial = [...images];
  check(!initial.some((f) => f.includes('-3000') || f.includes('-1800')), `no viewer-size images on first load (${initial.length} previews)`);
  check(imageBytes < 2_500_000, `lazy loading keeps first load small (${initial.length} of 21 previews, ${(imageBytes / 1e6).toFixed(2)} MB)`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal overflow (${overflow}px)`);

  const sheets = await page.$$eval('.sheet', (els) => els.map((el) => el.querySelector('img').alt));
  check(sheets.length === 21 && sheets.every((a) => a.length > 20), `21 sheets with alt text`);

  if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-hero.png`) });

  // Scroll the whole table so every page settles, then check for overlaps
  // larger than the deliberate spread joins.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += vp.height * 0.6) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(120);
  }
  await settle(page, 1300);
  const placed = await page.$$eval('.board .sheet.is-placed', (els) => els.length);
  check(placed === 20, `all 20 table pages settle into place (${placed})`);

  const overlaps = await page.$$eval('.board .sheet', (els) => {
    const boxes = els.map((el) => {
      const li = el.parentElement;
      return { i: el.dataset.index, l: li.offsetLeft, t: li.offsetTop, r: li.offsetLeft + li.offsetWidth, b: li.offsetTop + li.offsetHeight };
    });
    const out = [];
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        const w = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const h = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (w > 0 && h > 0) out.push(`${A.i}/${B.i}: ${w.toFixed(0)}×${h.toFixed(0)} (${((w / Math.min(A.r - A.l, B.r - B.l)) * 100).toFixed(1)}% wide)`);
      }
    return out;
  });
  // 19/20 is deliberate: the plain blue back cover tucks under the final page.
  const allowed = overlaps.every((o) => o.startsWith('19/20') || parseFloat(o.match(/\(([\d.]+)% wide/)[1]) <= 9);
  check(allowed, `overlaps stay at the edges: ${overlaps.join('; ') || 'none'}`);

  if (shots) {
    await page.evaluate(() => window.scrollTo({ top: document.querySelector('#pages').offsetTop - 20, behavior: 'instant' }));
    await settle(page, 1200);
    await page.screenshot({ path: path.join(shots, `${vp.name}-table.png`) });
    await page.screenshot({ path: path.join(shots, `${vp.name}-full.png`), fullPage: true });
  }

  // Viewer: open from the cover, page through, close back to the table.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(200);
  await page.click('.sheet--cover');
  await settle(page);
  let s = await state(page);
  check(s.open && s.count === 'Cover', `cover opens the viewer`);
  const viewerImg = await page.$eval('[data-image]', (img) => {
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, ratio: r.height / r.width, src: img.currentSrc };
  });
  check(viewerImg.w <= viewerImg.vw && viewerImg.h <= viewerImg.vh, `page fits the screen (${viewerImg.w.toFixed(0)}×${viewerImg.h.toFixed(0)})`);
  check(Math.abs(viewerImg.ratio - 10874 / 7684) < 0.01, `aspect ratio preserved (${viewerImg.ratio.toFixed(3)})`);
  if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-viewer.png`) });

  await page.keyboard.press('ArrowRight');
  await settle(page, 600);
  s = await state(page);
  check(s.count === '01', `→ turns to page 01`);
  await page.keyboard.press('End');
  await settle(page, 600);
  s = await state(page);
  const nextDisabled = await page.$eval('[data-next]', (b) => b.disabled);
  check(s.count === '20' && nextDisabled, `End jumps to the back cover; next is disabled`);
  await page.click('[data-prev]');
  await settle(page, 600);
  check((await state(page)).count === '19', `previous button turns back`);

  // Swipe (synthetic pointer drag across the stage).
  await page.evaluate(async () => {
    const stage = document.querySelector('[data-stage]');
    const r = stage.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const fire = (type, x) =>
      stage.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
    fire('pointerdown', r.left + r.width * 0.3);
    for (let i = 1; i <= 10; i++) {
      fire('pointermove', r.left + r.width * 0.3 + i * r.width * 0.05);
      await new Promise((res) => setTimeout(res, 16));
    }
    fire('pointerup', r.left + r.width * 0.8);
  });
  await settle(page, 600);
  check((await state(page)).count === '18', `swiping right turns back a page`);

  // Zoom for reading, then Esc unzooms before it closes.
  await page.click('[data-zoom]');
  await settle(page, 500);
  const zoom = await page.$eval('[data-image]', (img) => ({ w: img.getBoundingClientRect().width, src: img.currentSrc }));
  s = await state(page);
  check(s.zoomed && zoom.w > viewerImg.w * 1.8, `zoom enlarges to reading size (${zoom.w.toFixed(0)}px)`);
  await page.waitForTimeout(800);
  const zoomSrc = await page.$eval('[data-image]', (img) => img.currentSrc);
  const navOpacity = await page.$eval('[data-next]', (b) => getComputedStyle(b).opacity);
  check(navOpacity === '0', `page arrows step aside while zoomed (opacity ${navOpacity})`);
  check(/-(1800|3000)\.webp/.test(zoomSrc), `zoom uses a high-res copy (${path.basename(zoomSrc)})`);
  if (shots) await page.screenshot({ path: path.join(shots, `${vp.name}-zoom.png`) });
  await page.keyboard.press('Escape');
  await settle(page, 400);
  s = await state(page);
  check(s.open && !s.zoomed, `Esc first zooms back out`);
  await page.keyboard.press('Escape');
  await settle(page, 700);
  s = await state(page);
  check(!s.open && s.focused === '18', `Esc closes and returns focus to page 18 on the table`);
  const inView = await page.$eval('.sheet[data-index="18"]', (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility === 'visible';
  });
  check(inView, `table scrolled to the page you closed on`);

  // Keyboard: Tab to a sheet and open it with Enter.
  await page.focus('.sheet[data-index="5"]');
  await page.keyboard.press('Enter');
  await settle(page);
  s = await state(page);
  check(s.open && s.count === '05', `Enter on a focused page opens it`);
  await page.click('[data-close]');
  await settle(page);
  check(!(await state(page)).open, `close button closes`);

  check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
  await context.close();
}

// Reduced motion: no entrance movement; viewer still works.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  console.log('\n— reduced motion');
  const cover = await page.$eval('.sheet--cover', (el) => getComputedStyle(el).animationDuration);
  check(parseFloat(cover) < 0.01, `cover landing animation disabled (${cover})`);
  await page.evaluate(() => document.querySelector('#pages').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(80);
  const t = await page.$eval('.board .sheet', (el) => ({ translate: getComputedStyle(el).translate, transition: getComputedStyle(el).transitionProperty }));
  check(['none', '0px'].includes(t.translate) && !t.transition.includes('translate'), `table pages don't slide (${t.translate}; ${t.transition})`);
  await page.click('.board .sheet[data-index="3"]');
  await page.waitForTimeout(250);
  const anims = await page.$eval('[data-image]', (img) => img.getAnimations().filter((a) => a.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none')).length);
  check(anims === 0, `viewer opens without the flying transform`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  check((await state(page)).count === '04', `pages turn instantly`);
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
