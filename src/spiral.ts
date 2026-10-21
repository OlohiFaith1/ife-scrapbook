// Cobalt-enamelled wire spiral, drawn as one SVG in Figma px.
//
// The SVG spans the blue spine plus 8px into each page: x 0–8 is the inner
// edge of the left page, 8–27.53 the spine (19.53px), 27.53–35.53 the inner
// edge of the right page. Nothing (wire, holes or shadow) is drawn beyond
// those 8px, which the page margins were measured to keep clear of text.
//
// Two variants share the same holes in the right-hand page:
//   open   — each loop crosses the spine from a hole in the left page
//   closed — each loop wraps round the left edge of the closed cover

const OVERLAP = 8;
const SPINE = 19.534;
const WIDTH = OVERLAP * 2 + SPINE;
const HEIGHT = 700;
const CENTRE = WIDTH / 2;

const HOLE_INSET = 4; // hole centres, measured from each page's inner edge
const LEFT_HOLE = OVERLAP - HOLE_INSET;
const RIGHT_HOLE = OVERLAP + SPINE + HOLE_INSET;

const LOOPS = 31;
const PITCH = 21;
const SLANT = 5; // a helix: the right end of each loop sits a little lower
const TOP = (HEIGHT - (LOOPS - 1) * PITCH - SLANT) / 2;

const loopYs = Array.from({ length: LOOPS }, (_, i) => TOP + i * PITCH);
const f = (n: number) => n.toFixed(2);

function openLoop(y: number) {
  const y2 = y + SLANT;
  return `M${f(LEFT_HOLE)} ${f(y)}C${f(LEFT_HOLE + 6)} ${f(y - 4.2)} ${f(RIGHT_HOLE - 6)} ${f(y2 - 4.2)} ${f(RIGHT_HOLE)} ${f(y2)}`;
}

/** Front of a loop on the closed book: out of the cover, round its edge. */
function closedFront(y: number) {
  const y2 = y + SLANT;
  return `M${f(RIGHT_HOLE)} ${f(y2)}C${f(RIGHT_HOLE - 6.5)} ${f(y2 - 4.6)} ${f(8)} ${f(y - 3.5)} ${f(5.2)} ${f(y + 2.6)}`;
}

/** The return of the loop, running back behind the board's edge. */
function closedBack(y: number) {
  return `M${f(5.2)} ${f(y + 2.6)}C${f(5.6)} ${f(y + 5.2)} ${f(10)} ${f(y + 6.6)} ${f(CENTRE - 0.4)} ${f(y + 6.4)}`;
}

function holes(xs: number[], dy = 0) {
  return loopYs
    .flatMap((y) => xs.map((x) => `<ellipse cx="${f(x)}" cy="${f(y + (x === RIGHT_HOLE ? SLANT : 0) + dy)}" rx="1.45" ry="1.85"/>`))
    .join('');
}

function wire(paths: string[]) {
  const d = paths.join('');
  return `
    <path class="spiral__shadow" d="${d}" filter="url(#spiral-blur)"/>
    <path class="spiral__wire" d="${d}"/>
    <path class="spiral__enamel" d="${d}"/>
    <path class="spiral__shine" d="${d}"/>`;
}

export function spiralSvg(): string {
  const open = loopYs.map(openLoop);
  const closedFronts = loopYs.map(closedFront);
  const closedBacks = loopYs.map(closedBack).join('');

  return `
<svg class="spiral" viewBox="0 0 ${f(WIDTH)} ${HEIGHT}" aria-hidden="true" focusable="false">
  <defs>
    <filter id="spiral-blur" x="-20%" y="-5%" width="140%" height="110%">
      <feGaussianBlur stdDeviation="0.7"/>
    </filter>
  </defs>
  <g class="spiral__closed">
    <g class="spiral__holes">${holes([RIGHT_HOLE])}</g>
    <path class="spiral__back" d="${closedBacks}"/>
    ${wire(closedFronts)}
  </g>
  <g class="spiral__open">
    <g class="spiral__holes">${holes([LEFT_HOLE, RIGHT_HOLE])}</g>
    ${wire(open)}
  </g>
</svg>`;
}

/** Where the SVG sits in the book, in Figma px (see styles.css). */
export const SPIRAL_BOX = { width: WIDTH, height: HEIGHT, overlap: OVERLAP };
