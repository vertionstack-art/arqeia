import { type Vec2, add, sub, mul, dist, norm, angleOf, fromPolar, closestOnSegment, projectOnLine, angleInArc } from './geometry/vec.js';
import { intersectPrims, type Prim } from './geometry/intersect.js';
import type { Entity } from './model/types.js';
import { entityPrims, entitySnapPoints, type SnapKind, type SnapPoint } from './model/entities.js';

export interface SnapSettings {
  enabled: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  quadrant: boolean;
  intersection: boolean;
  perpendicular: boolean;
  tangent: boolean;
  nearest: boolean;
  grid: boolean;
  gridSize: number;
}

export const defaultSnapSettings = (gridSize = 500): SnapSettings => ({
  enabled: true,
  endpoint: true,
  midpoint: true,
  center: true,
  quadrant: true,
  intersection: true,
  perpendicular: true,
  tangent: true,
  nearest: false,
  grid: false,
  gridSize,
});

const RANK: Record<SnapKind, number> = {
  endpoint: 0,
  intersection: 0,
  center: 0,
  quadrant: 1,
  midpoint: 1,
  perpendicular: 2,
  tangent: 2,
  nearest: 3,
  grid: 4,
};

export interface SnapQuery {
  cursor: Vec2;
  /** Raio de captura em mm (já convertido a partir de pixels). */
  tolerance: number;
  /** Entidades candidatas (normalmente vindas do índice espacial perto do cursor). */
  entities: Entity[];
  /** Ponto base do comando em curso (necessário para perpendicular e tangente). */
  base?: Vec2 | null;
  settings: SnapSettings;
}

const MAX_INTERSECTION_ENTITIES = 80;

const perpendicularFoot = (prim: Prim, base: Vec2): Vec2 | null => {
  if (prim.kind === 'seg') {
    const { point, t } = projectOnLine(base, prim.a, prim.b);
    return t >= 0 && t <= 1 ? point : null;
  }
  if (dist(base, prim.c) < 1e-9) return null;
  const p = add(prim.c, mul(norm(sub(base, prim.c)), prim.r));
  if (prim.kind === 'arc' && !angleInArc(angleOf(sub(p, prim.c)), prim.start, prim.end)) return null;
  return p;
};

const tangentPoints = (prim: Prim, base: Vec2): Vec2[] => {
  if (prim.kind === 'seg') return [];
  const d = dist(base, prim.c);
  if (d <= prim.r) return [];
  const a = angleOf(sub(base, prim.c));
  const b = Math.acos(prim.r / d);
  return [a + b, a - b]
    .map((ang) => add(prim.c, fromPolar(prim.r, ang)))
    .filter((p) => prim.kind !== 'arc' || angleInArc(angleOf(sub(p, prim.c)), prim.start, prim.end));
};

const nearestOnPrim = (prim: Prim, p: Vec2): Vec2 => {
  if (prim.kind === 'seg') return closestOnSegment(p, prim.a, prim.b).point;
  const onCircle = add(prim.c, mul(norm(sub(p, prim.c)), prim.r));
  if (prim.kind === 'circle' || angleInArc(angleOf(sub(onCircle, prim.c)), prim.start, prim.end)) return onCircle;
  const e1 = add(prim.c, fromPolar(prim.r, prim.start));
  const e2 = add(prim.c, fromPolar(prim.r, prim.end));
  return dist(p, e1) < dist(p, e2) ? e1 : e2;
};

/** Encontra o melhor ponto de snap, respeitando prioridade entre tipos. */
export const findSnap = (q: SnapQuery): SnapPoint | null => {
  const s = q.settings;
  if (!s.enabled) return null;
  const candidates: SnapPoint[] = [];
  const consider = (sp: SnapPoint) => {
    if (dist(sp.p, q.cursor) <= q.tolerance) candidates.push(sp);
  };

  for (const e of q.entities) {
    for (const sp of entitySnapPoints(e)) {
      if (s[sp.kind as keyof SnapSettings]) consider(sp);
    }
  }

  const prims = q.entities.flatMap((e) => entityPrims(e).map((p) => ({ e: e.id, p })));

  if (s.intersection && q.entities.length <= MAX_INTERSECTION_ENTITIES) {
    for (let i = 0; i < prims.length; i++)
      for (let j = i + 1; j < prims.length; j++) {
        if (prims[i].e === prims[j].e) continue;
        for (const p of intersectPrims(prims[i].p, prims[j].p)) consider({ kind: 'intersection', p });
      }
  }

  if (q.base) {
    for (const { p } of prims) {
      if (s.perpendicular) {
        const f = perpendicularFoot(p, q.base);
        if (f && dist(f, q.base) > 1e-6) consider({ kind: 'perpendicular', p: f });
      }
      if (s.tangent) for (const t of tangentPoints(p, q.base)) consider({ kind: 'tangent', p: t });
    }
  }

  if (s.nearest) for (const { p } of prims) consider({ kind: 'nearest', p: nearestOnPrim(p, q.cursor) });

  if (candidates.length > 0) {
    candidates.sort((a, b) => RANK[a.kind] - RANK[b.kind] || dist(a.p, q.cursor) - dist(b.p, q.cursor));
    return candidates[0];
  }

  if (s.grid && s.gridSize > 0) {
    const g = s.gridSize;
    return { kind: 'grid', p: { x: Math.round(q.cursor.x / g) * g, y: Math.round(q.cursor.y / g) * g } };
  }
  return null;
};

/** Restringe o ponto à horizontal ou vertical a partir da base (modo ortogonal). */
export const applyOrtho = (base: Vec2, p: Vec2): Vec2 => {
  const d = sub(p, base);
  return Math.abs(d.x) >= Math.abs(d.y) ? { x: p.x, y: base.y } : { x: base.x, y: p.y };
};
