import './styles.css';
import { COVER, PAGES, SPREADS, srcset, src, type Page } from './pages';
import { turnHtml } from './sheet';
import { hush, play, primeAudio, tick } from './sound';
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
  | 'closing'
  | 'back';

/** Typing the question, in ms: the cursor's wait before the first key, per
    character, extra at a word gap or line end, how long the cursor keeps
    blinking once the sentence is typed, and the pause before the book. */
const TYPE = { start: 600, key: 70, word: 60, line: 240, linger: 1600, pause: 600 };
/** Typewriter keys, taken in turn so a run of characters doesn't repeat, and
    how long one rings (public/sounds/key*.wav). */
const KEYS = ['key1', 'key2', 'key3'] as const;
const KEY_RING = 90;
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
const question = document.querySelector<HTMLElement>('.question')!;
const bookScreen = document.querySelector<HTMLElement>('.screen--book')!;
const turn = document.querySelector<HTMLElement>('[data-turn]')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state: State = 'loading';
/** Index into SPREADS of the spread under the cover, or on show when open. */
let spread = 0;
const LAST = SPREADS.length - 1;
/** Pages 09|10: the book pushes in slightly while this spread is open. */
const MIDDLE = SPREADS.findIndex(([page]) => page.slug === '09');

function setState(next: State) {
  state = next;
  root.dataset.state = next;
}

/** Resolves on the first matching animationend, or after `fallback` ms. */
function afterAnimation(el: HTMLElement, name: string, fallback: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener('animationend', onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (e: AnimationEvent) => e.target === el && e.animationName === name && done();
    const timer = window.setTimeout(done, fallback);
    el.addEventListener('animationend', onEnd);
  });
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
turn.innerHTML = turnHtml();

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
    document.fonts.load('500 17px Inter', 'project by Ife website built by Snow'),
    decode(texture),
  ]),
  wait(2500),
]).then(async () => {
  setState('question');
  // Reduced motion: the sentence is shown whole at once, with no typing.
  if (!reducedMotion.matches) await typeQuestion();
  const timer = window.setTimeout(showBook, TYPE.pause);

  // Once the question is typed, any click, tap or key skips the wait
  // (Tab and shortcuts are left alone).
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

/**
 * Types the question one character at a time behind a blinking cursor. Every
 * character is laid out from the start and only becomes visible when typed
 * (.question.is-typing), so the centred lines never shift and the text stays
 * real and selectable. The cursor is moved after the latest character rather
 * than re-inserted, so its blink never restarts. Each character comes with a
 * soft key tap (the space bar quieter), heard once the visitor's first click or
 * key has allowed audio. Resolves once the sentence is typed and the cursor,
 * after blinking a little longer, has gone.
 */
async function typeQuestion() {
  const keys: HTMLSpanElement[] = [];
  const lines: string[] = [];
  for (const node of [...question.childNodes]) {
    if (node.nodeName === 'BR') continue;
    const text = node.textContent ?? '';
    lines.push(text);
    const spans = [...text].map((char) => {
      const span = document.createElement('span');
      span.className = 'question__key';
      span.textContent = char;
      keys.push(span);
      return span;
    });
    node.replaceWith(...spans);
  }
  // Read as one sentence, not character by character.
  question.setAttribute('aria-label', lines.join(' '));
  question.classList.add('is-typing');

  const cursor = document.createElement('span');
  cursor.className = 'question__cursor';
  cursor.setAttribute('aria-hidden', 'true');
  const place = (key: HTMLSpanElement, after: boolean) => {
    cursor.style.left = `${key.offsetLeft + (after ? key.offsetWidth : 0)}px`;
    cursor.style.top = `${key.offsetTop}px`;
  };
  place(keys[0], false);
  question.append(cursor);

  // Taps sound from the first character where the browser allows audio before
  // any interaction, otherwise from the visitor's first click, tap or key; a
  // hidden tab silences them.
  primeAudio();
  const silence = () => document.hidden && hush(KEYS);
  document.addEventListener('visibilitychange', silence);

  // Each character is due at a set time from the start, so a busy moment (such
  // as audio starting up on the visitor's first click) delays one character,
  // not every character after it.
  let due = performance.now() + TYPE.start;
  await wait(TYPE.start);
  for (const [i, key] of keys.entries()) {
    key.classList.add('is-typed');
    place(key, true);
    tick(KEYS[i % KEYS.length], key.textContent === ' ' ? 0.6 : 1);
    const next = keys[i + 1];
    if (!next) break;
    // A steady hand with a little unevenness, a beat between words, and a
    // longer one where the line breaks.
    const lineEnd = next.offsetTop > key.offsetTop;
    due += TYPE.key + ((i * 37) % 11) * 3 + (key.textContent === ' ' ? TYPE.word : 0) + (lineEnd ? TYPE.line : 0);
    await wait(Math.max(0, due - performance.now()));
  }

  // Let the last key ring out, then make sure nothing is left sounding; the
  // cursor's linger is shortened to match, so the timing is unchanged.
  await wait(KEY_RING);
  hush(KEYS);
  document.removeEventListener('visibilitychange', silence);
  await wait(TYPE.linger - KEY_RING);
  cursor.remove();
  question.classList.remove('is-typing');
}

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

// ─── Turning between spreads: a sheet turns over the spine ─────

async function turnTo(next: number) {
  setState('turning');
  const forward = next > spread;
  const incoming = ([left, right] as const).map((board, i) => {
    const img = spare(board);
    setPage(img, SPREADS[next][i]);
    // Last in the board paints on top, so it fades in over the outgoing page.
    board.append(img);
    return img;
  });
  await Promise.race([Promise.all(incoming.map(decode)), wait(1500)]);

  void book.offsetWidth; // commit the re-ordered images before turning
  book.classList.toggle('is-middle', next === MIDDLE);
  await (reducedMotion.matches ? crossfade(incoming) : flip(incoming, forward));

  for (const board of [left, right]) {
    for (const img of board.querySelectorAll<HTMLImageElement>('.page')) img.classList.toggle('is-current', incoming.includes(img));
  }
  spread = next;
  syncBoards();
  setState('open');
  live.textContent = `Pages ${SPREADS[next][0].slug} and ${SPREADS[next][1].slug}.`;
  preload(next + 1);
}

/** Reduced motion: both pages swap in a 200ms crossfade. */
async function crossfade(incoming: HTMLImageElement[]) {
  for (const img of incoming) {
    img.parentElement!.classList.add('is-crossfading');
    img.classList.add('is-current');
  }
  await afterTransition(incoming[1], 'opacity', 600);
  for (const board of [left, right]) board.classList.remove('is-crossfading');
}

/** Shows `img` on its board at once (no crossfade). */
function show(img: HTMLImageElement) {
  for (const page of img.parentElement!.querySelectorAll('.page')) page.classList.toggle('is-current', page === img);
}

/**
 * Turns one sheet over the spine (src/sheet.ts): `front` and `back` are its two
 * faces as CSS images, `board` makes it a stiff, board-sized sheet. `lifted`
 * runs once the sheet covers what it lifts, so that can change beneath it;
 * `landed` runs in the same frame the sheet is put away.
 */
async function turnSheet(
  { front, back, forward, board = false }: { front: string; back: string; forward: boolean; board?: boolean },
  lifted: () => void,
  landed: () => void,
) {
  turn.dataset.dir = forward ? 'forward' : 'back';
  if (board) turn.dataset.kind = 'board';
  else delete turn.dataset.kind;
  turn.style.setProperty('--front', front);
  turn.style.setProperty('--back', back);
  turn.classList.add('is-turning');
  // Let the sheet paint over the page before that page changes beneath it.
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  lifted();
  await afterAnimation(turn, 'turn-lift', 2000);
  landed();
  turn.classList.remove('is-turning');
}

/**
 * The page on the side being turned lifts as a sheet (front: that page, back:
 * the next page on the other side). The page beneath is revealed as it lifts,
 * and once the sheet lands its back becomes the page on the other side.
 */
async function flip([nextLeft, nextRight]: HTMLImageElement[], forward: boolean) {
  const [from, beneath, landing] = forward ? [right, nextRight, nextLeft] : [left, nextLeft, nextRight];
  await turnSheet(
    { front: `url("${current(from).currentSrc}")`, back: `url("${landing.currentSrc}")`, forward },
    () => show(beneath),
    () => show(landing),
  );
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

/**
 * From 19|20: the last sheet turns over with the back board, and the journal
 * closes on its blank back cover, which then slides to the centre.
 */
async function closeToBack() {
  const hadFocus = book.contains(document.activeElement);
  setInteractive(false);

  if (reducedMotion.matches) {
    book.classList.add('is-turning-over', 'is-back');
    fadeIn();
  } else {
    setState('turning');
    await turnSheet(
      { front: `url("${current(right).currentSrc}")`, back: 'linear-gradient(var(--cover-blue), var(--cover-blue))', forward: true, board: true },
      () => book.classList.add('is-turning-over'),
      () => book.classList.add('is-back'),
    );
  }

  setState('back');
  left.inert = false;
  left.removeAttribute('aria-describedby');
  left.setAttribute('aria-label', 'The back cover. Return to the front cover');
  if (hadFocus) left.focus({ preventScroll: true });
  live.textContent = 'The back cover.';
}

/** From the back cover: the book fades out and comes back closed on the front cover. */
async function backToFront() {
  if (state !== 'back' || left.inert) return;
  left.inert = true;
  play('cover');
  const hadFocus = book.contains(document.activeElement);
  const leaveBack = () => {
    book.classList.remove('is-turning-over', 'is-back');
    resetToFirstSpread();
  };

  if (reducedMotion.matches) {
    leaveBack();
    fadeIn();
    settleClosed(hadFocus);
    return;
  }

  book.classList.add('is-hidden');
  await afterTransition(book, 'opacity', 600);

  // While invisible, jump to the closed layout and restore 01|02.
  book.classList.add('no-motion');
  leaveBack();
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
  else if (next > LAST) closeToBack();
  else turnTo(next);
}

cover.addEventListener('click', open);
left.addEventListener('click', () => (state === 'back' ? backToFront() : go(-1)));
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
  } else if (state === 'back' && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    backToFront();
  }
});
