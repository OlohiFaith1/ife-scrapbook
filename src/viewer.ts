import { RATIO } from './layout';
import { PAGES, src, srcset, WIDTHS } from './pages';

const LAST = PAGES.length - 1;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

interface Options {
  /** The element on the table that shows page `index`. */
  sheetFor: (index: number) => HTMLElement | null;
  /** Makes sure a sheet is visible (entrance finished) before we fly to it. */
  reveal: (sheet: HTMLElement) => void;
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Viewer is missing ${selector}`);
  return el;
}

export class Viewer {
  private readonly dialog: HTMLDialogElement;
  private readonly shade: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly count: HTMLElement;
  private readonly of: HTMLElement;
  private readonly title: HTMLElement;
  private readonly live: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly zoomButton: HTMLButtonElement;
  private readonly chrome: HTMLElement[];

  private index = 0;
  private zoomed = false;
  private closing = false;
  private turn: Animation | null = null;
  private hidden: HTMLElement | null = null;
  private suppressClick = false;

  constructor(
    dialog: HTMLDialogElement,
    private readonly options: Options,
  ) {
    this.dialog = dialog;
    this.shade = query(dialog, '.viewer__shade');
    this.stage = query(dialog, '[data-stage]');
    this.scroller = query(dialog, '[data-scroller]');
    this.img = query(dialog, '[data-image]');
    this.count = query(dialog, '[data-count]');
    this.of = query(dialog, '.viewer__of');
    this.title = query(dialog, '[data-title]');
    this.live = query(dialog, '[data-live]');
    this.prev = query(dialog, '[data-prev]');
    this.next = query(dialog, '[data-next]');
    this.zoomButton = query(dialog, '[data-zoom]');
    this.chrome = [query(dialog, '.viewer__bar'), this.prev, this.next, query(dialog, '.viewer__help')];
    this.scroller.tabIndex = -1;

    this.prev.addEventListener('click', () => this.go(-1));
    this.next.addEventListener('click', () => this.go(1));
    this.zoomButton.addEventListener('click', () => this.toggleZoom());
    query<HTMLButtonElement>(dialog, '[data-close]').addEventListener('click', () => this.close());

    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (this.zoomed) this.toggleZoom();
      else this.close();
    });
    dialog.addEventListener('keydown', (e) => this.onKey(e));

    this.img.addEventListener('click', (e) => {
      if (this.suppressClick) return;
      this.toggleZoom(e.clientX, e.clientY);
    });
    this.scroller.addEventListener('click', (e) => {
      // A click on the dark surround puts the page back down.
      if (e.target === this.scroller && !this.zoomed && !this.suppressClick) this.close();
    });

    this.bindSwipe();
    window.addEventListener('resize', () => this.dialog.open && this.layout());
  }

  get isOpen() {
    return this.dialog.open;
  }

  private get animate() {
    return !reducedMotion.matches;
  }

  // ─── Opening & closing ────────────────────────────────────

  open(index: number) {
    if (this.dialog.open) return;
    const origin = this.options.sheetFor(index);
    this.closing = false;
    this.index = index;

    document.documentElement.classList.add('viewer-open');
    this.dialog.showModal();
    this.show(index);
    query<HTMLButtonElement>(this.dialog, '[data-close]').focus({ preventScroll: true });

    if (!this.animate || !origin) {
      this.fade(true);
      return;
    }

    const from = origin.getBoundingClientRect();
    const to = this.img.getBoundingClientRect();
    this.fade(true);
    this.img.animate(
      [
        { transform: this.flip(from, to, origin.offsetWidth, rotationOf(origin)), boxShadow: 'none' },
        { transform: 'none' },
      ],
      { duration: 560, easing: EASE },
    );
  }

  close() {
    if (!this.dialog.open || this.closing) return;
    this.closing = true;
    if (this.zoomed) this.setZoom(false);
    this.turn?.cancel();

    const target = this.options.sheetFor(this.index);
    const finish = () => {
      this.dialog.close();
      document.documentElement.classList.remove('viewer-open');
      this.unhide();
      [this.shade, this.img, ...this.chrome].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
      target?.focus({ preventScroll: true });
      this.closing = false;
    };

    if (target) {
      // If you browsed away from where you started, the table follows you.
      const r = target.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      this.options.reveal(target);
    }

    if (!this.animate || !target) {
      this.fade(false).then(finish);
      return;
    }

    const from = this.img.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    this.fade(false);
    this.img
      .animate(
        [{ transform: 'none' }, { transform: this.flip(to, from, target.offsetWidth, rotationOf(target)), boxShadow: 'none' }],
        { duration: 420, easing: EASE, fill: 'forwards' },
      )
      .finished.then(finish);
  }

  /** Transform that places the viewer image over `rect` (a sheet on the table). */
  private flip(rect: DOMRect, imgRect: DOMRect, unrotatedWidth: number, rotation: number) {
    const dx = rect.left + rect.width / 2 - (imgRect.left + imgRect.width / 2);
    const dy = rect.top + rect.height / 2 - (imgRect.top + imgRect.height / 2);
    const scale = unrotatedWidth / imgRect.width;
    return `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${rotation}deg)`;
  }

  private fade(visible: boolean): Promise<unknown> {
    const opts: KeyframeAnimationOptions = {
      duration: this.animate ? (visible ? 320 : 300) : 120,
      easing: 'ease',
      // Only hold the hidden end state, so CSS (e.g. zoom hiding the arrows)
      // stays in charge once the viewer is open.
      fill: visible ? 'backwards' : 'forwards',
    };
    const frames = visible ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
    const shade = this.shade.animate(frames, opts);
    this.chrome.forEach((el) => el.animate(frames, { ...opts, delay: visible && this.animate ? 140 : 0 }));
    if (!this.animate) this.img.animate(frames, opts);
    return shade.finished;
  }

  // ─── Showing a page ───────────────────────────────────────

  private show(index: number) {
    const page = PAGES[index];
    this.index = index;

    // Hide the page on the table while it's "picked up".
    this.unhide();
    const sheet = this.options.sheetFor(index);
    if (sheet) {
      sheet.style.visibility = 'hidden';
      this.hidden = sheet;
    }

    // Paint the already-loaded table preview underneath until the sharp copy loads.
    const preview = sheet?.querySelector('img')?.currentSrc || src(page, 480);
    this.img.style.setProperty('--placeholder', `url("${preview}")`);
    this.img.style.setProperty('--c', page.color);
    this.img.alt = `${page.label}: ${page.alt}`;
    this.img.srcset = srcset(page, WIDTHS);
    this.layout();
    this.img.src = src(page, 1800);

    this.count.textContent = index === 0 ? 'Cover' : String(index).padStart(2, '0');
    this.of.textContent = index === 0 ? '' : ` / ${LAST}`;
    this.title.textContent = page.title;
    this.live.textContent = index === 0 ? `Cover: ${page.title}` : `Page ${index} of ${LAST}: ${page.title}`;

    this.prev.disabled = index === 0;
    this.next.disabled = index === LAST;
    if (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled) {
      (index === 0 ? this.next : this.prev).focus();
    }

    this.preload(index - 1);
    this.preload(index + 1);
  }

  private unhide() {
    if (this.hidden) this.hidden.style.visibility = '';
    this.hidden = null;
  }

  private preload(index: number) {
    const page = PAGES[index];
    if (!page) return;
    const img = new Image();
    img.sizes = this.img.sizes;
    img.srcset = srcset(page, WIDTHS);
  }

  /** Size the page to fit the stage (or to reading size when zoomed). */
  private layout() {
    const fit = this.fitWidth();
    const width = this.zoomed ? this.zoomWidth(fit) : fit;
    this.img.style.width = `${width}px`;
    this.img.sizes = `${width}px`;
  }

  private fitWidth() {
    const cs = getComputedStyle(this.scroller);
    const w = this.scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = this.scroller.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(120, Math.floor(Math.min(w, h / RATIO)));
  }

  private zoomWidth(fit: number) {
    const reading = Math.min(1500, this.stage.clientWidth * 3);
    return Math.round(Math.min(3000, Math.max(fit * 2.2, reading)));
  }

  // ─── Turning pages ────────────────────────────────────────

  go(delta: number, fromTransform = 'none') {
    const target = Math.max(0, Math.min(LAST, this.index + delta));
    if (target === this.index || this.closing) {
      this.springBack(fromTransform);
      return;
    }
    if (this.zoomed) this.setZoom(false);
    this.turn?.cancel();

    if (!this.animate) {
      this.show(target);
      return;
    }

    const dir = Math.sign(delta);
    const out = this.img.animate(
      [
        { transform: fromTransform },
        { transform: `translateX(${-dir * 70}px) rotate(${-dir * 1.6}deg)`, opacity: 0 },
      ],
      { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    this.turn = out;
    out.finished
      .then(() => {
        this.show(target);
        out.cancel();
        this.turn = this.img.animate(
          [{ transform: `translateX(${dir * 70}px) rotate(${dir * 1.6}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 300, easing: EASE },
        );
      })
      .catch(() => {
        /* superseded by a newer turn */
      });
  }

  private springBack(fromTransform: string) {
    this.img.style.transform = '';
    if (fromTransform === 'none' || !this.animate) return;
    this.img.animate([{ transform: fromTransform }, { transform: 'none' }], { duration: 260, easing: EASE });
  }

  private bindSwipe() {
    let id: number | null = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;

    const transformFor = (x: number) => `translateX(${x}px) rotate(${x * 0.012}deg)`;

    this.stage.addEventListener('pointerdown', (e) => {
      if (this.zoomed || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      id = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = false;
    });

    this.stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const x = e.clientX - startX;
      const y = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(x) < 10 || Math.abs(x) < Math.abs(y)) return;
        dragging = true;
        try {
          this.stage.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      }
      const atEdge = (x > 0 && this.index === 0) || (x < 0 && this.index === LAST);
      dx = atEdge ? x * 0.3 : x;
      this.img.style.transform = transformFor(dx);
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!dragging) return;
      dragging = false;
      // The click that follows a drag shouldn't zoom or close.
      this.suppressClick = true;
      window.setTimeout(() => (this.suppressClick = false), 0);

      const from = transformFor(dx);
      this.img.style.transform = '';
      if (e.type === 'pointerup' && Math.abs(dx) > Math.min(90, this.stage.clientWidth * 0.18)) {
        this.go(dx < 0 ? 1 : -1, from);
      } else {
        this.springBack(from);
      }
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
  }

  // ─── Zoom ─────────────────────────────────────────────────

  /** Toggle reading zoom, keeping the clicked point under the pointer. */
  toggleZoom(clientX?: number, clientY?: number) {
    const before = this.img.getBoundingClientRect();
    const box = this.scroller.getBoundingClientRect();
    const px = clientX ?? box.left + box.width / 2;
    const py = clientY ?? box.top + box.height * 0.3;
    const rx = Math.min(1, Math.max(0, (px - before.left) / before.width));
    const ry = Math.min(1, Math.max(0, (py - before.top) / before.height));

    this.setZoom(!this.zoomed);

    if (this.zoomed) {
      const cs = getComputedStyle(this.scroller);
      const width = this.img.offsetWidth;
      const left = this.img.offsetLeft || parseFloat(cs.paddingLeft);
      this.scroller.scrollLeft = left + rx * width - (px - box.left);
      this.scroller.scrollTop = parseFloat(cs.paddingTop) + ry * width * RATIO - (py - box.top);
      this.scroller.focus({ preventScroll: true });
    }

    if (!this.animate) return;
    const after = this.img.getBoundingClientRect();
    const scale = before.width / after.width;
    this.img.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${scale})`,
        },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 340, easing: EASE },
    );
  }

  private setZoom(on: boolean) {
    this.zoomed = on;
    this.dialog.classList.toggle('is-zoomed', on);
    this.zoomButton.setAttribute('aria-pressed', String(on));
    this.zoomButton.setAttribute('aria-label', on ? 'Zoom out' : 'Zoom in to read');
    this.layout();
    if (!on) {
      this.scroller.scrollTo(0, 0);
      if (this.dialog.contains(document.activeElement) && document.activeElement === this.scroller) {
        this.zoomButton.focus();
      }
    }
  }

  // ─── Keyboard ─────────────────────────────────────────────

  private onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        if (this.zoomed && e.key === 'ArrowRight') return; // pans the zoomed page
        e.preventDefault();
        this.go(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        if (this.zoomed && e.key === 'ArrowLeft') return;
        e.preventDefault();
        this.go(-1);
        break;
      case 'Home':
        e.preventDefault();
        this.go(-this.index);
        break;
      case 'End':
        e.preventDefault();
        this.go(LAST - this.index);
        break;
      case 'z':
      case 'Z':
      case '+':
      case '=':
      case '-':
        if ((e.key === '-') !== this.zoomed && e.key !== 'z' && e.key !== 'Z') return;
        e.preventDefault();
        this.toggleZoom();
        break;
    }
  }
}

function rotationOf(el: HTMLElement): number {
  const r = getComputedStyle(el).rotate;
  return r && r !== 'none' ? parseFloat(r) : 0;
}
