// The sheet that turns over the spine between spreads (styles: "Page turn" in
// src/styles.css). It is STRIPS narrow vertical strips, each nested in the one
// before and hinged to it, so the sheet can bend like paper rather than swing
// like a card. Every strip carries a front and a back face showing its slice of
// the two page images. One CSS animation drives --lift (the whole sheet turning
// on the spine) and --curl (the bend); each hinge takes a share of the curl that
// grows towards the free edge, so the paper curls most where it is held.

export const STRIPS = 16;

export function turnHtml() {
  // Hinge k (between strips k-1 and k) bends by curl × w[k]; c[k] is the total
  // bend at strip k and c[k + 1] at its far edge, so its shading can run into
  // the next strip's without a step. Strip 0 hinges on the spine only.
  const raw = Array.from({ length: STRIPS }, (_, k) => k ** 1.5);
  const total = raw.reduce((sum, v) => sum + v, 0);
  const w = raw.map((v) => v / total);
  const c = w.map((_, k) => w.slice(0, k + 1).reduce((sum, v) => sum + v, 0));

  let strips = '';
  for (let k = STRIPS - 1; k >= 0; k--) {
    const edge = k === STRIPS - 1 ? ' sheet__strip--edge' : '';
    strips =
      `<div class="sheet__strip${edge}" style="--k: ${k}; --w: ${w[k].toFixed(4)}; --c: ${c[k].toFixed(4)}; --cn: ${(c[k + 1] ?? 1).toFixed(4)}">` +
      '<div class="sheet__face sheet__face--front"></div><div class="sheet__face sheet__face--back"></div>' +
      `${strips}</div>`;
  }
  return (
    '<div class="turn__shadow turn__shadow--from"></div><div class="turn__shadow turn__shadow--to"></div>' +
    `<div class="sheet" style="--strips: ${STRIPS}">${strips}</div>`
  );
}
