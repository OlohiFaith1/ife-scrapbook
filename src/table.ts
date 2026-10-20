import { DESKTOP, DESKTOP_HEIGHT, MOBILE, MOBILE_HEIGHT, MOBILE_MAX } from './layout';
import { PAGES, src, srcset, type Page } from './pages';

const PREVIEW_WIDTHS = [480, 800, 1200];

// Board width is min(100vw - gutters, 1144px); on phones it's 100vw - 32px.
function sizesFor(desktopW: number, mobileW: number): string {
  const mobile = `${(mobileW * 0.92).toFixed(1)}vw`;
  const desktop = `min(${(desktopW * 0.92).toFixed(1)}vw, ${Math.round(desktopW * 11.44)}px)`;
  return `(max-width: ${MOBILE_MAX}px) ${mobile}, ${desktop}`;
}

function renderSheet(page: Page, i: number): HTMLLIElement {
  const d = DESKTOP[i];
  const m = MOBILE[i];

  const li = document.createElement('li');
  li.style.cssText = [
    `--x:${d.x}`,
    `--y:${d.y}`,
    `--w:${d.w}`,
    d.z !== undefined ? `--z:${d.z}` : '',
    `--mx:${m.x}`,
    `--my:${m.y.toFixed(2)}`,
    `--mw:${m.w}`,
    m.z !== undefined ? `--mz:${m.z}` : '',
  ]
    .filter(Boolean)
    .join(';');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sheet';
  button.dataset.index = String(page.index);
  button.setAttribute('aria-haspopup', 'dialog');
  // Entrance tilt alternates direction so pages seem to be dealt by hand.
  button.style.cssText = `--dr:${d.r};--mr:${m.r};--enter-r:${i % 2 ? 3 : -3};--c:${page.color}`;

  const img = document.createElement('img');
  img.src = src(page, 800);
  img.srcset = srcset(page, PREVIEW_WIDTHS);
  img.sizes = sizesFor(d.w, m.w);
  img.width = page.width;
  img.height = page.height;
  img.alt = `${page.label}: ${page.alt}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;

  button.append(img);
  li.append(button);
  return li;
}

export function renderTable(board: HTMLElement): HTMLButtonElement[] {
  board.style.setProperty('--h', DESKTOP_HEIGHT.toFixed(2));
  board.style.setProperty('--mh', MOBILE_HEIGHT.toFixed(2));

  const pages = PAGES.slice(1);
  board.append(...pages.map(renderSheet));
  const sheets = [...board.querySelectorAll<HTMLButtonElement>('.sheet')];

  if ('IntersectionObserver' in window) armEntrances(board, sheets);
  return sheets;
}

/** Pages settle onto the table as they scroll into view. */
function armEntrances(board: HTMLElement, sheets: HTMLButtonElement[]) {
  board.classList.add('is-armed');

  const observer = new IntersectionObserver(
    (entries) => {
      const arriving = entries
        .filter((e) => e.isIntersecting)
        .map((e) => e.target as HTMLButtonElement)
        .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));

      arriving.forEach((sheet, order) => {
        observer.unobserve(sheet);
        const delay = Math.min(order, 4) * 90;
        sheet.style.setProperty('--delay', `${delay}ms`);
        sheet.classList.add('is-placed');
        // Hand transitions back to the quick hover timing once it lands.
        window.setTimeout(() => sheet.classList.add('is-settled'), delay + 950);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );

  sheets.forEach((s) => observer.observe(s));
}
