/**
 * Finding the panels in a grid sheet (3×3 for one picture per page; 3×2 for
 * stories from the earlier six-panel format). The image model draws the grid
 * well but not exactly evenly (outer margins differ from gutters, and thin
 * borders appear), so instead of cutting equal sixths we look for the plain
 * background between panels: columns and rows that are almost entirely the
 * corner (background) colour are gutters; the runs between them are panels.
 * When detection does not find exactly the expected columns and rows we
 * fall back to an even split with a margin. Pure, so it is unit tested with synthetic sheets.
 */

/** A panel as fractions of the sheet: x, y, width, height in 0..1. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Pixels {
  width: number
  height: number
  /** RGBA, row-major, like ImageData.data. */
  data: Uint8ClampedArray | number[]
}

export interface Grid {
  cols: number
  rows: number
}

/** Grid shape for a story's imageLayout; null when it has no panel sheet. */
export function gridFor(layout: string | undefined): Grid | null {
  if (layout === 'grid3x3') return { cols: 3, rows: 3 }
  if (layout === 'grid3x2') return { cols: 3, rows: 2 }
  return null
}

function colourDistance(d: Pixels['data'], i: number, bg: [number, number, number]) {
  return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2])
}

/** Runs of indices where `busy[i]` holds, ignoring runs shorter than `minLen`. */
function runs(busy: boolean[], minLen: number): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  busy.forEach((b, i) => {
    if (b && start < 0) start = i
    if ((!b || i === busy.length - 1) && start >= 0) {
      const end = b ? i + 1 : i
      if (end - start >= minLen) out.push([start, end])
      start = -1
    }
  })
  return out
}

/**
 * The background colour: per-channel median of a frame of pixels just inside
 * the edges, which is nearly all margin. Not the corner pixel: the model's
 * sheets have darkened corners (seen on the real test sheet: corner
 * 227,221,209 vs margin 252,249,233), which made every gutter look busy.
 */
function backgroundColour({ width: W, height: H, data }: Pixels): [number, number, number] {
  // 1% in from the edge: inside even a narrow margin (a real 3x3 sheet had
  // only ~2.9%, so a 3% inset sampled the panel borders), yet past the edge
  // pixels. The median shrugs off the darkened corners.
  const ix = Math.max(1, Math.round(W * 0.01))
  const iy = Math.max(1, Math.round(H * 0.01))
  const samples: number[][] = [[], [], []]
  const take = (x: number, y: number) => {
    const i = (y * W + x) * 4
    for (let c = 0; c < 3; c++) samples[c].push(data[i + c])
  }
  for (let x = ix; x < W - ix; x++) {
    take(x, iy)
    take(x, H - 1 - iy)
  }
  for (let y = iy; y < H - iy; y++) {
    take(ix, y)
    take(W - 1 - ix, y)
  }
  const median = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  return [median(samples[0]), median(samples[1]), median(samples[2])]
}

export function detectPanels(px: Pixels, { cols: COLS, rows: ROWS }: Grid): Box[] | null {
  const { width: W, height: H, data } = px
  if (W < 30 || H < 20) return null
  const bg = backgroundColour(px)
  const colBusy = new Array<number>(W).fill(0)
  const rowBusy = new Array<number>(H).fill(0)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (colourDistance(data, (y * W + x) * 4, bg) > 36) {
        colBusy[x]++
        rowBusy[y]++
      }
    }
  }
  // A gutter is (nearly) all background; anything else belongs to a panel.
  const cols = runs(colBusy.map((n) => n / H > 0.04), W * (0.5 / COLS))
  const rows = runs(rowBusy.map((n) => n / W > 0.04), H * (0.5 / ROWS))
  if (cols.length !== COLS || rows.length !== ROWS) return null
  const boxes: Box[] = []
  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      // Trim 2% on each side to drop the thin frame the model tends to draw.
      const tx = (x1 - x0) * 0.02
      const ty = (y1 - y0) * 0.02
      boxes.push({ x: (x0 + tx) / W, y: (y0 + ty) / H, w: (x1 - x0 - 2 * tx) / W, h: (y1 - y0 - 2 * ty) / H })
    }
  }
  return boxes
}

/** An even split with a margin: right often enough to be a safe fallback. */
export function evenPanels({ cols: COLS, rows: ROWS }: Grid): Box[] {
  const boxes: Box[] = []
  const mx = 0.06
  const my = 0.08
  const gap = 0.035
  const w = (1 - 2 * mx - (COLS - 1) * gap) / COLS
  const h = (1 - 2 * my - (ROWS - 1) * gap) / ROWS
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) boxes.push({ x: mx + c * (w + gap), y: my + r * (h + gap), w, h })
  }
  return boxes
}

/** CSS that shows just `box` of the sheet in an element of any size. */
export function cropStyle(src: string, box: Box): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100)
  return {
    backgroundImage: `url("${src.replace(/"/g, '%22')}")`,
    backgroundSize: `${100 / box.w}% ${100 / box.h}%`,
    backgroundPosition: `${pos(box.x, box.w)}% ${pos(box.y, box.h)}%`,
  }
}
