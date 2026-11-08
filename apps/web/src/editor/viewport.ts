import type { BBox, Vec2 } from '@traco/core';
import type { View } from './store.ts';

/**
 * Transformações projeto ⇄ tela. O cálculo é feito em double por ponto
 * (subtraindo o centro antes de multiplicar), o que preserva precisão
 * mesmo com coordenadas grandes (ex.: UTM em milhões de mm).
 */
export const MIN_ZOOM = 1e-5;
export const MAX_ZOOM = 50;

export interface Size {
  w: number;
  h: number;
}

export const toScreen = (v: View, s: Size, p: Vec2): Vec2 => ({
  x: (p.x - v.cx) * v.zoom + s.w / 2,
  y: s.h / 2 - (p.y - v.cy) * v.zoom,
});

export const toWorld = (v: View, s: Size, p: Vec2): Vec2 => ({
  x: (p.x - s.w / 2) / v.zoom + v.cx,
  y: (s.h / 2 - p.y) / v.zoom + v.cy,
});

export const viewBox = (v: View, s: Size): BBox => {
  const hw = s.w / 2 / v.zoom;
  const hh = s.h / 2 / v.zoom;
  return { minX: v.cx - hw, minY: v.cy - hh, maxX: v.cx + hw, maxY: v.cy + hh };
};

/** Zoom mantendo fixo o ponto do mundo sob o cursor. */
export const zoomAt = (v: View, s: Size, screen: Vec2, factor: number): View => {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const before = toWorld(v, s, screen);
  const nv = { ...v, zoom };
  const after = toWorld(nv, s, screen);
  return { cx: nv.cx + (before.x - after.x), cy: nv.cy + (before.y - after.y), zoom };
};

export const fitBox = (b: BBox, s: Size, margin = 0.1): View => {
  const w = Math.max(b.maxX - b.minX, 1000);
  const h = Math.max(b.maxY - b.minY, 1000);
  const zoom = Math.min((s.w * (1 - margin * 2)) / w, (s.h * (1 - margin * 2)) / h);
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) };
};

/** Espaçamento de grade "redondo" (1-2-5 × 10ⁿ) que dê pelo menos `minPx` na tela. */
export const niceGridStep = (zoom: number, minPx = 14): number => {
  const raw = minPx / zoom;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
};
