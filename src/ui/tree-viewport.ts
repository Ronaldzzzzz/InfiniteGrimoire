/** Pure viewport maths for the grimoire tree (no DOM). */
export interface View {
  /** centre of the window, in tree coordinates */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const HOME: View = { x: 0, y: 0, zoom: 1 };

export function viewBoxOf(view: View, base: number): string {
  const w = base / view.zoom;
  return `${view.x - w / 2} ${view.y - w / 2} ${w} ${w}`;
}

/** Zooms by `factor` (clamped) keeping tree point `p` at the same place on screen. */
export function zoomAt(view: View, factor: number, p: { x: number; y: number }): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  if (zoom === view.zoom) return view;
  const k = view.zoom / zoom;
  return { x: p.x + (view.x - p.x) * k, y: p.y + (view.y - p.y) * k, zoom };
}

/** Zoom factor for one wheel event: proportional to the distance scrolled (a mouse notch of 100px is x1.1), clamped per event. */
export function wheelFactor(deltaY: number, deltaMode: number, pageHeight: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageHeight : deltaY;
  return Math.min(1.25, Math.max(1 / 1.25, Math.exp((-px * Math.log(1.1)) / 100)));
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

const GAP = 12;

/** Bubble sizes used to place it (measured in a browser: learned spells wrap their buttons to two rows; the longest hint is 94px). */
export const BUBBLE_SIZE = { locked: { w: 220, h: 96 }, learned: { w: 220, h: 132 } };

/** Where a bubble goes next to a node (pixels inside the stage): above and to the right by default. */
export function bubblePlacement(
  node: { x: number; y: number },
  stage: { w: number; h: number },
  bubble: { w: number; h: number },
): { left: number; top: number; side: 'above' | 'below'; align: 'left' | 'right' } {
  const align = node.x + bubble.w > stage.w ? 'right' : 'left';
  const side = node.y - GAP - bubble.h < 0 ? 'below' : 'above';
  const rawLeft = align === 'left' ? node.x : node.x - bubble.w;
  const rawTop = side === 'above' ? node.y - GAP - bubble.h : node.y + GAP;
  const left = Math.max(0, Math.min(stage.w - bubble.w, rawLeft));
  const top = Math.max(0, Math.min(stage.h - bubble.h, rawTop));
  return { left, top, side, align };
}
