import type { Vec2 } from './vec.ts';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const emptyBox = (): BBox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export const isEmptyBox = (b: BBox): boolean => b.minX > b.maxX || b.minY > b.maxY;

export const boxFromPoints = (pts: Vec2[]): BBox => {
  const b = emptyBox();
  for (const p of pts) extendBox(b, p);
  return b;
};

export const extendBox = (b: BBox, p: Vec2): BBox => {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
  return b;
};

export const unionBox = (a: BBox, b: BBox): BBox => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const inflateBox = (b: BBox, d: number): BBox => ({
  minX: b.minX - d,
  minY: b.minY - d,
  maxX: b.maxX + d,
  maxY: b.maxY + d,
});

export const boxesIntersect = (a: BBox, b: BBox): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const boxContainsBox = (outer: BBox, inner: BBox): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

export const boxContainsPoint = (b: BBox, p: Vec2): boolean =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
