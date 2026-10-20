// Placements for pages 1–20 on the table. Units are percentages of the
// table's width (x, y, w), so the composition scales as one piece.
// Page heights follow the artwork's ratio (~1.415), which the y values
// were planned around: rows never cover another page's content, and the
// three spreads (05–06, 07–08, 09–10) sit edge to edge as they were designed.

export interface Placement {
  x: number;
  y: number;
  w: number;
  /** Resting rotation in degrees. */
  r: number;
  /** Optional stacking order; later pages sit on top by default. */
  z?: number;
}

export const RATIO = 10874 / 7684;

export const DESKTOP: Placement[] = [
  { x: 5, y: 2, w: 25, r: -1.8 }, //       01 intro letter
  { x: 37, y: 0, w: 23, r: 1.4 }, //       02 ink cloud
  { x: 67, y: 4, w: 28, r: -0.6 }, //      03 it's a pen's world
  { x: 8, y: 47, w: 27, r: 1.2 }, //       04 fridge incident
  { x: 41, y: 42, w: 26, r: -0.8 }, //     05 meet lapo  ┐ spread
  { x: 66.4, y: 46, w: 26, r: 0.9 }, //    06 continued  ┘
  { x: 12, y: 93, w: 36, r: -0.7 }, //     07 things pens ┐ spread
  { x: 47.7, y: 94, w: 36, r: 0.8 }, //    08 remember    ┘
  { x: 5, y: 150, w: 30, r: -1 }, //       09 the plaintiff ┐ spread
  { x: 34.7, y: 151, w: 30, r: 0.7 }, //   10 continued     ┘
  { x: 70, y: 148, w: 25, r: 1.8 }, //     11 chat bubbles
  { x: 10, y: 197, w: 24, r: -2 }, //      12 marble
  { x: 38, y: 198, w: 27, r: 0.6 }, //     13 born into the right hands
  { x: 68, y: 190, w: 26, r: -1.1 }, //    14 nepo's journal
  { x: 6, y: 236, w: 24, r: 1.5 }, //      15 ink in water
  { x: 33, y: 241, w: 34, r: -0.7 }, //    16 well-travelled
  { x: 71, y: 233, w: 24, r: 1.9 }, //     17 every pen has a story
  { x: 6, y: 276, w: 26, r: -1.2 }, //     18 justice for pens
  { x: 39.5, y: 295, w: 30, r: 0.8, z: 2 }, // 19 final statement
  { x: 67.6, y: 274, w: 22, r: -2.4, z: 1 }, // 20 back cover, tucked under 19
];

// On phones the table becomes a tall, staggered column: single pages that
// alternate sides, with the spreads (and a couple of image pairs) shown
// side by side at a smaller size.
type MobileSlot = 'left' | 'right' | 'pair' | 'wide' | 'tuck';

const MOBILE_SEQUENCE: MobileSlot[] = [
  'left', //  01
  'right', // 02
  'left', //  03
  'right', // 04
  'pair', //  05 + 06
  'pair', //  07 + 08
  'pair', //  09 + 10
  'left', //  11
  'pair', //  12 + 13
  'right', // 14
  'left', //  15
  'wide', //  16 (dense text, given more room)
  'pair', //  17 + 18
  'wide', //  19
  'tuck', //  20
];

const MOBILE_TILT = [-1.6, 1.3, -0.9, 1.7, -1.2, 0.8, -1.8, 1.1, -0.6, 1.5, -1.3, 0.9];

function buildMobile(): { placements: Placement[]; height: number } {
  const placements: Placement[] = [];
  const gap = 7;
  let y = 2;
  let tilt = 0;
  const next = () => MOBILE_TILT[tilt++ % MOBILE_TILT.length];

  for (const slot of MOBILE_SEQUENCE) {
    if (slot === 'pair') {
      const w = 45.5;
      placements.push({ x: 3.5, y, w, r: next() });
      placements.push({ x: 50.5, y: y + 5, w, r: next() });
      y += w * RATIO + 5 + gap;
    } else if (slot === 'tuck') {
      // The plain back cover peeks out from under the final statement.
      const w = 40;
      const last = placements[placements.length - 1];
      placements.push({ x: 56, y: y - 16, w, r: -3, z: 0 });
      last.z = 1;
      y += w * RATIO - 16 + gap;
    } else {
      const w = slot === 'wide' ? 80 : 68;
      const x = slot === 'left' ? 5 : slot === 'right' ? 27 : 8;
      placements.push({ x, y, w, r: next() });
      y += w * RATIO + gap;
    }
  }
  return { placements, height: y };
}

const mobile = buildMobile();

export const MOBILE: Placement[] = mobile.placements;

const bottom = (list: Placement[]) => Math.max(...list.map((p) => p.y + p.w * RATIO));

/** Table heights in the same width-relative units, with room for shadows. */
export const DESKTOP_HEIGHT = bottom(DESKTOP) + 6;
export const MOBILE_HEIGHT = mobile.height;

/** Breakpoint (px) where the table switches to the mobile composition. */
export const MOBILE_MAX = 680;
