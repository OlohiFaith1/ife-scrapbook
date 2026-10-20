import './styles.css';
import { COVER, SPREADS, srcset, src, type Page } from './pages';

type State = 'loading' | 'question' | 'crossfade' | 'closed' | 'opening' | 'open';

const QUESTION_HOLD = 3000;
const BOOK_WIDTHS = [800, 1200];
// The page slot is 475×672 Figma px; the stage scales by min(vw/1440, vh/1024).
const BOOK_SIZES = 'min(33vw, 46.4vh)';

const root = document.querySelector<HTMLElement>('.experience')!;
const book = document.querySelector<HTMLElement>('[data-book]')!;
const cover = document.querySelector<HTMLButtonElement>('[data-cover]')!;
const live = document.querySelector<HTMLElement>('[data-live]')!;
const questionScreen = document.querySelector<HTMLElement>('.screen--question')!;
const bookScreen = document.querySelector<HTMLElement>('.screen--book')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state: State = 'loading';

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

const [first] = SPREADS;
const pagesBySlug: Record<string, Page> = { cover: COVER, '01': first[0], '02': first[1] };

for (const img of document.querySelectorAll<HTMLImageElement>('img[data-page]')) {
  const page = pagesBySlug[img.dataset.page!];
  img.sizes = BOOK_SIZES;
  img.srcset = srcset(page, BOOK_WIDTHS);
  img.src = src(page, 1200);
  img.decoding = 'async';
  if (!('decorative' in img.dataset)) img.alt = `${page.label}: ${page.alt}`;
}

cover.setAttribute('aria-label', `Open the scrapbook. ${COVER.alt}`);

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
  const hadFocus = document.activeElement === cover;

  if (reducedMotion.matches) {
    setState('open');
    book.classList.add('is-fading');
    book.addEventListener('animationend', () => book.classList.remove('is-fading'), { once: true });
  } else {
    setState('opening');
    await afterTransition(cover, 'rotate', 2000);
    // Swap the 3D leaf for the flat left board so the spread is pixel-crisp.
    setState('open');
  }

  cover.inert = true;
  if (hadFocus) book.focus({ preventScroll: true });
  live.textContent = 'Pages 01 and 02.';
}

cover.addEventListener('click', open);
window.addEventListener('keydown', (e) => {
  if (state !== 'closed' || e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    open();
  }
});
