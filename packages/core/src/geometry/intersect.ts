import { type Vec2, EPS, add, cross, dist, dot, mul, sub, angleOf, angleInArc } from './vec.ts';

/** Primitiva geométrica elementar usada em interseções, trim e extend. */
export type Prim =
  | { kind: 'seg'; a: Vec2; b: Vec2 }
  | { kind: 'circle'; c: Vec2; r: number }
  | { kind: 'arc'; c: Vec2; r: number; start: number; end: number };

type RoundPrim = Exclude<Prim, { kind: 'seg' }>;

/** Interseção de retas infinitas (p + t·r) e (q + u·s). Retorna t e u ou null se paralelas. */
export const lineLineParams = (p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): { t: number; u: number } | null => {
  const r = sub(p2, p);
  const s = sub(q2, q);
  const den = cross(r, s);
  if (Math.abs(den) < EPS * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return null;
  const qp = sub(q, p);
  return { t: cross(qp, s) / den, u: cross(qp, r) / den };
};

export const segSeg = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2[] => {
  const r = lineLineParams(a, b, c, d);
  if (!r) return [];
  const tol = 1e-9;
  if (r.t < -tol || r.t > 1 + tol || r.u < -tol || r.u > 1 + tol) return [];
  return [add(a, mul(sub(b, a), r.t))];
};

/** Interseção da reta infinita ab com o círculo; retorna parâmetros t ao longo de ab. */
export const lineCircleParams = (a: Vec2, b: Vec2, c: Vec2, r: number): number[] => {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  if (A < EPS) return [];
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-9) return [];
  if (Math.abs(disc) <= 1e-9) return [-B / (2 * A)];
  const sq = Math.sqrt(disc);
  return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
};

export const circleCircle = (c1: Vec2, r1: number, c2: Vec2, r2: number): Vec2[] => {
  const d = dist(c1, c2);
  if (d < EPS) return [];
  if (d > r1 + r2 + 1e-9) return [];
  if (d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const ux = (c2.x - c1.x) / d;
  const uy = (c2.y - c1.y) / d;
  const px = c1.x + ux * a;
  const py = c1.y + uy * a;
  if (h < 1e-9) return [{ x: px, y: py }];
  return [
    { x: px - uy * h, y: py + ux * h },
    { x: px + uy * h, y: py - ux * h },
  ];
};

/** Verdadeiro se o ponto (já sobre o círculo) pertence ao trecho do arco. */
export const pointOnRoundPrim = (p: Vec2, prim: RoundPrim): boolean => {
  if (prim.kind === 'circle') return true;
  return angleInArc(angleOf(sub(p, prim.c)), prim.start, prim.end);
};

/** Todas as interseções entre duas primitivas limitadas. */
export const intersectPrims = (p: Prim, q: Prim): Vec2[] => {
  if (p.kind === 'seg' && q.kind === 'seg') return segSeg(p.a, p.b, q.a, q.b);
  if (p.kind === 'seg') {
    const qc = q as RoundPrim;
    return lineCircleParams(p.a, p.b, qc.c, qc.r)
      .filter((t) => t >= -1e-9 && t <= 1 + 1e-9)
      .map((t) => add(p.a, mul(sub(p.b, p.a), t)))
      .filter((pt) => pointOnRoundPrim(pt, qc));
  }
  if (q.kind === 'seg') return intersectPrims(q, p);
  const pc = p as RoundPrim;
  const qc = q as RoundPrim;
  return circleCircle(pc.c, pc.r, qc.c, qc.r).filter((pt) => pointOnRoundPrim(pt, pc) && pointOnRoundPrim(pt, qc));
};
