import './styles.css';
import { COVER, PAGES, SPREADS, srcset, src, type Page } from './pages';
import { play } from './sound';
import { spiralSvg } from './spiral';

type State =
  | 'loading'
  | 'question'
  | 'crossfade'
  | 'closed'
  | 'opening'
  | 'open'
  | 'turning'
  | 'closing-start'
  | 'closing';

const QUESTION_HOLD = 3000;
const BOOK_WIDTHS = [800, 1200];
// The page slot is 475×672 Figma px; the stage scales by min(vw/1440, vh/1024).
const BOOK_SIZES = 'min(33vw, 46.4vh)';

const root = document.querySelector<HTMLElement>('.experience')!;
const book = document.querySelector<HTMLElement>('[data-book]')!;
const cover = document.querySelector<HTMLButtonElement>('[data-cover]')!;
const left = document.querySelector<HTMLButtonElement>('[data-side="left"]')!;
const right = document.querySelector<HTMLButtonElement>('[data-side="right"]')!;
const live = document.querySelector<HTMLElement>('[data-live]')!;
const questionScreen = document.querySelector<HTMLElement>('.screen--question')!;
const bookScreen = document.querySelector<HTMLElement>('.screen--book')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state: State = 'loading';
/** Index into SPREADS of the spread under the cover, or on show when open. */
let spread = 0;
const LAST = SPREADS.length - 1;

function setState(next: State) {
  state = next;
  root.dataset.state = next;
}

/** Resolves on the first matching transitionend, or after `fallback` ms. */
function afterTransition(el: HTMLElement, property: string, fallback: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (e: TransitionEvent) => e.target === el && e.propertyName === property && done();
    const timer = window.setTimeout(done, fallback);
    el.addEventListener('transitionend', onEnd);
  });
}

// ─── Page images ───────────────────────────────────────────────

const pagesBySlug = new Map(PAGES.map((page) => [page.slug, page]));
const describe = (page: Page) => `${page.label}: ${page.alt}`;

function setPage(img: HTMLImageElement, page: Page) {
  img.dataset.page = page.slug;
  img.sizes = BOOK_SIZES;
  img.srcset = srcset(page, BOOK_WIDTHS);
  img.src = src(page, 1200);
  img.decoding = 'async';
}

for (const img of document.querySelectorAll<HTMLImageElement>('img[data-page]')) {
  const page = pagesBySlug.get(img.dataset.page!)!;
  setPage(img, page);
  if (!('decorative' in img.dataset)) img.alt = describe(page);
}

cover.setAttribute('aria-label', `Open the scrapbook. ${COVER.alt}`);

// The spiral sits over the spine and never takes clicks (pointer-events: none).
document.querySelector<HTMLElement>('[data-spiral]')!.innerHTML = spiralSvg();

// ─── Boards: labels and the page each one shows ────────────────

const current = (board: HTMLElement) => board.querySelector<HTMLImageElement>('.page.is-current')!;
const spare = (board: HTMLElement) => board.querySelector<HTMLImageElement>('.page:not(.is-current)')!;

for (const board of [left, right]) {
  board.querySelectorAll('.page').forEach((img, i) => (img.id = `page-${board.dataset.side}-${i}`));
}

/** Only the current image is exposed; it also describes its board button. */
function syncBoard(board: HTMLButtonElement) {
  for (const img of board.querySelectorAll<HTMLImageElement>('.page')) {
    if (img.classList.contains('is-current')) {
      img.alt = describe(pagesBySlug.get(img.dataset.page!)!);
      img.removeAttribute('aria-hidden');
      board.setAttribute('aria-describedby', img.id);
    } else {
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
    }
  }
}

const pair = (i: number) => `pages ${SPREADS[i][0].slug} and ${SPREADS[i][1].slug}`;

function syncBoards() {
  syncBoard(left);
  syncBoard(right);
  left.setAttribute('aria-label', spread === 0 ? 'Close the scrapbook' : `Previous: ${pair(spread - 1)}`);
  right.setAttribute('aria-label', spread === LAST ? 'Close the scrapbook' : `Next: ${pair(spread + 1)}`);
}

/** Boards take input only while the book lies open; the cover only while closed. */
function setInteractive(open: boolean) {
  left.inert = !open;
  right.inert = !open;
  cover.inert = open;
}

/** Warm the cache for a spread so its crossfade doesn't wait on the network. */
function preload(i: number) {
  for (const page of SPREADS[i] ?? []) setPage(new Image(), page);
}

syncBoards();
setInteractive(false);

// ─── Loading → Screen 1 ────────────────────────────────────────

const decode = (img: HTMLImageElement) => img.decode().catch(() => undefined);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const texture = new Image();
texture.src = `${import.meta.env.BASE_URL}texture/wall-texture.webp`;

Promise.race([
  Promise.all([
    document.fonts.load('400 128px Caveat', 'why don’t we'),
    document.fonts.load('500 17px Inter', 'created by Snow, for Ife'),
    decode(texture),
  ]),
  wait(2500),
]).then(() => {
  setState('question');
  const timer = window.setTimeout(showBook, QUESTION_HOLD);

  // Any click, tap or key skips the wait (Tab and shortcuts are left alone).
  const skip = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey)) return;
    window.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', skip);
    window.clearTimeout(timer);
    showBook();
  };
  window.addEventListener('pointerdown', skip);
  window.addEventListener('keydown', skip);
});

// ─── Screen 1 → Screen 2: plain crossfade ──────────────────────

async function showBook() {
  if (state !== 'question') return;
  // Hold the fade until the cover and first spread can be shown in full.
  const images = [...document.querySelectorAll<HTMLImageElement>('img[data-page]')];
  await Promise.race([Promise.all(images.map(decode)), wait(1500)]);

  setState('crossfade');
  questionScreen.setAttribute('aria-hidden', 'true');
  questionScreen.inert = true;

  await afterTransition(bookScreen, 'opacity', 1500);
  setState('closed');
  live.textContent = 'The scrapbook cover.';
}

// ─── Opening the cover ─────────────────────────────────────────

async function open() {
  if (state !== 'closed') return;
  play('cover');
  const hadFocus = document.activeElement === cover;

  if (reducedMotion.matches) {
    setState('open');
    fadeIn();
  } else {
    setState('opening');
    await afterTransition(cover, 'rotate', 2000);
    // Swap the 3D leaf for the flat left board so the spread is pixel-crisp.
    setState('open');
  }

  setInteractive(true);
  if (hadFocus) book.focus({ preventScroll: true });
  live.textContent = 'Pages 01 and 02.';
  preload(1);
}

/** Reduced motion: no swing or slide, the book settles in place with a short fade. */
function fadeIn() {
  book.classList.add('is-fading');
  book.addEventListener('animationend', () => book.classList.remove('is-fading'), { once: true });
}

// ─── Turning between spreads: a 200ms crossfade ────────────────

async function turnTo(next: number) {
  setState('turning');
  const incoming = ([left, right] as const).map((board, i) => {
    const img = spare(board);
    setPage(img, SPREADS[next][i]);
    // Last in the board paints on top, so it fades in over the outgoing page.
    board.append(img);
    return img;
  });
  await Promise.race([Promise.all(incoming.map(decode)), wait(1500)]);

  void book.offsetWidth; // commit the re-ordered images before fading
  for (const img of incoming) {
    img.parentElement!.classList.add('is-crossfading');
    img.classList.add('is-current');
  }
  await afterTransition(incoming[1], 'opacity', 600);

  for (const board of [left, right]) {
    board.classList.remove('is-crossfading');
    for (const img of board.querySelectorAll<HTMLImageElement>('.page')) img.classList.toggle('is-current', incoming.includes(img));
  }
  spread = next;
  syncBoards();
  setState('open');
  live.textContent = `Pages ${SPREADS[next][0].slug} and ${SPREADS[next][1].slug}.`;
  preload(next + 1);
}

// ─── Back to the cover ─────────────────────────────────────────

/** Put 01|02 back under the cover (only while the book is hidden or shut). */
function resetToFirstSpread() {
  spread = 0;
  setPage(current(left), SPREADS[0][0]);
  setPage(current(right), SPREADS[0][1]);
  syncBoards();
}

function settleClosed(hadFocus: boolean) {
  setState('closed');
  if (hadFocus) cover.focus({ preventScroll: true });
  live.textContent = 'The scrapbook cover.';
}

/** From 01|02: the cover swings back over page 01, reversing the opening. */
async function closeFromFirst() {
  const hadFocus = book.contains(document.activeElement);
  setInteractive(false);

  if (reducedMotion.matches) {
    fadeIn();
  } else {
    setState('closing-start'); // leaf placed open, without a transition
    void book.offsetWidth;
    setState('closing');
    await afterTransition(cover, 'rotate', 2000);
  }
  settleClosed(hadFocus);
}

/** From 19|20: the whole book fades out and comes back closed on the cover. */
async function closeFromLast() {
  const hadFocus = book.contains(document.activeElement);
  setInteractive(false);

  if (reducedMotion.matches) {
    resetToFirstSpread();
    fadeIn();
    settleClosed(hadFocus);
    return;
  }

  setState('turning');
  book.classList.add('is-hidden');
  await afterTransition(book, 'opacity', 600);

  // While invisible, jump to the closed layout and restore 01|02.
  book.classList.add('no-motion');
  resetToFirstSpread();
  setState('closing');
  void book.offsetWidth;
  book.classList.remove('no-motion', 'is-hidden');
  await afterTransition(book, 'opacity', 600);
  settleClosed(hadFocus);
}

// ─── Input ─────────────────────────────────────────────────────

/** -1 = left page / previous, +1 = right page / next. Ignored mid-animation. */
function go(step: -1 | 1) {
  if (state !== 'open') return;
  const next = spread + step;
  play(next < 0 || next > LAST ? 'cover' : 'page');
  if (next < 0) closeFromFirst();
  else if (next > LAST) closeFromLast();
  else turnTo(next);
}

cover.addEventListener('click', open);
left.addEventListener('click', () => go(-1));
right.addEventListener('click', () => go(1));
for (const link of document.querySelectorAll('.credit__link')) link.addEventListener('click', () => play('tap'));
window.addEventListener('keydown', (e) => {
  // Keys on a focused footer link belong to the link (Enter follows it).
  if (e.repeat || e.target instanceof HTMLAnchorElement) return;
  if (state === 'closed' && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
    e.preventDefault();
    open();
  } else if (state === 'open' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    go(e.key === 'ArrowLeft' ? -1 : 1);
  }
});
