import {
  type Vec2,
  add,
  sub,
  mul,
  dist,
  mid,
  norm,
  perp,
  angleOf,
  fromPolar,
  rotateAround,
  scaleAround,
  mirrorAcross,
  distToSegment,
  angleInArc,
  normAngle,
  arcSweep,
  cross,
  len,
} from '../geometry/vec.js';
import { type BBox, boxFromPoints, inflateBox } from '../geometry/bbox.js';
import { type Prim, lineLineParams } from '../geometry/intersect.js';
import type { Entity, WallEntity, PolylineEntity, TextEntity, DimensionEntity, ArcEntity, RoofEntity } from './types.js';
import { roofGeometry } from './bim.js';

/** Contorno de planta da cobertura (com beiral); cai para os pontos se for inválida. */
export const roofOutline = (r: RoofEntity): Vec2[] => roofGeometry(r)?.outline ?? r.points;

// ---------------------------------------------------------------------------
// Geometria derivada
// ---------------------------------------------------------------------------

/** Os quatro cantos da parede: [a-esq, b-esq, b-dir, a-dir]. */
export const wallOutline = (w: Pick<WallEntity, 'a' | 'b' | 'thickness'>): Vec2[] => {
  const n = mul(perp(norm(sub(w.b, w.a))), w.thickness / 2);
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
};

export const textBox = (t: TextEntity): Vec2[] => {
  // largura aproximada: 0,6 × altura por caractere (fonte técnica monoespaçada)
  const w = Math.max(1, t.text.length) * t.height * 0.6;
  const corners = [t.p, add(t.p, { x: w, y: 0 }), add(t.p, { x: w, y: t.height }), add(t.p, { x: 0, y: t.height })];
  return corners.map((c) => rotateAround(c, t.p, t.rotation));
};

export interface DimensionGeometry {
  /** Pontos da linha de cota. */
  d1: Vec2;
  d2: Vec2;
  /** Linhas de chamada (extensão). */
  ext1: [Vec2, Vec2];
  ext2: [Vec2, Vec2];
  textPos: Vec2;
  textAngle: number;
  value: number;
}

export const dimensionGeometry = (d: DimensionEntity): DimensionGeometry => {
  const dir = norm(sub(d.b, d.a));
  const n = perp(dir);
  const off = mul(n, d.offset);
  const d1 = add(d.a, off);
  const d2 = add(d.b, off);
  const sign = Math.sign(d.offset) || 1;
  const gap = mul(n, sign * Math.min(Math.abs(d.offset) * 0.15, 50));
  const over = mul(n, sign * 100);
  let textAngle = angleOf(dir);
  // texto sempre legível (não de cabeça para baixo)
  if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) textAngle += Math.PI;
  return {
    d1,
    d2,
    ext1: [add(d.a, gap), add(d1, over)],
    ext2: [add(d.b, gap), add(d2, over)],
    textPos: mid(d1, d2),
    textAngle,
    value: dist(d.a, d.b),
  };
};

export const arcEndpoints = (e: Pick<ArcEntity, 'c' | 'r' | 'start' | 'end'>): [Vec2, Vec2] => [
  add(e.c, fromPolar(e.r, e.start)),
  add(e.c, fromPolar(e.r, e.end)),
];

/** Decompõe a entidade em primitivas para interseção/snap/trim. */
export const entityPrims = (e: Entity): Prim[] => {
  switch (e.type) {
    case 'line':
      return [{ kind: 'seg', a: e.a, b: e.b }];
    case 'polyline': {
      const out: Prim[] = [];
      const n = e.points.length;
      for (let i = 0; i < n - 1; i++) out.push({ kind: 'seg', a: e.points[i], b: e.points[i + 1] });
      if (e.closed && n > 2) out.push({ kind: 'seg', a: e.points[n - 1], b: e.points[0] });
      return out;
    }
    case 'circle':
      return [{ kind: 'circle', c: e.c, r: e.r }];
    case 'arc':
      return [{ kind: 'arc', c: e.c, r: e.r, start: e.start, end: e.end }];
    case 'wall': {
      const [p0, p1, p2, p3] = wallOutline(e);
      return [
        { kind: 'seg', a: p0, b: p1 },
        { kind: 'seg', a: p1, b: p2 },
        { kind: 'seg', a: p2, b: p3 },
        { kind: 'seg', a: p3, b: p0 },
      ];
    }
    case 'slab':
    case 'roof': {
      const pts = e.type === 'roof' ? roofOutline(e) : e.points;
      return polyEdges(pts, true).map(([a, b]) => ({ kind: 'seg' as const, a, b }));
    }
    case 'dimension':
    case 'text':
      return [];
  }
};

export const arcBBox = (c: Vec2, r: number, start: number, end: number): BBox => {
  const [p1, p2] = arcEndpoints({ c, r, start, end });
  const pts = [p1, p2];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    if (angleInArc(a, start, end)) pts.push(add(c, fromPolar(r, a)));
  }
  return boxFromPoints(pts);
};

export const entityBBox = (e: Entity): BBox => {
  switch (e.type) {
    case 'line':
      return boxFromPoints([e.a, e.b]);
    case 'polyline':
      return boxFromPoints(e.points);
    case 'circle':
      return { minX: e.c.x - e.r, minY: e.c.y - e.r, maxX: e.c.x + e.r, maxY: e.c.y + e.r };
    case 'arc':
      return arcBBox(e.c, e.r, e.start, e.end);
    case 'wall':
      return boxFromPoints(wallOutline(e));
    case 'slab':
      return boxFromPoints(e.points);
    case 'roof':
      return boxFromPoints(roofOutline(e));
    case 'text':
      return boxFromPoints(textBox(e));
    case 'dimension': {
      const g = dimensionGeometry(e);
      return inflateBox(boxFromPoints([e.a, e.b, ...g.ext1, ...g.ext2]), 0);
    }
  }
};

const pointInPolygon = (p: Vec2, poly: Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Distância do ponto à entidade (para seleção por clique). */
export const entityDistance = (e: Entity, p: Vec2): number => {
  switch (e.type) {
    case 'text':
      return pointInPolygon(p, textBox(e)) ? 0 : Math.min(...polyEdges(textBox(e), true).map(([a, b]) => distToSegment(p, a, b)));
    case 'wall':
      if (pointInPolygon(p, wallOutline(e))) return 0;
      break;
    case 'dimension': {
      const g = dimensionGeometry(e);
      return Math.min(distToSegment(p, g.d1, g.d2), distToSegment(p, ...g.ext1), distToSegment(p, ...g.ext2));
    }
    default:
      break;
  }
  let best = Infinity;
  for (const prim of entityPrims(e)) best = Math.min(best, primDistance(prim, p));
  return best;
};

export const primDistance = (prim: Prim, p: Vec2): number => {
  if (prim.kind === 'seg') return distToSegment(p, prim.a, prim.b);
  const dc = dist(p, prim.c);
  if (prim.kind === 'circle') return Math.abs(dc - prim.r);
  if (angleInArc(angleOf(sub(p, prim.c)), prim.start, prim.end)) return Math.abs(dc - prim.r);
  const [e1, e2] = arcEndpoints(prim);
  return Math.min(dist(p, e1), dist(p, e2));
};

const polyEdges = (pts: Vec2[], closed: boolean): [Vec2, Vec2][] => {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  return out;
};

// ---------------------------------------------------------------------------
// Pontos notáveis (snap)
// ---------------------------------------------------------------------------

export type SnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'intersection'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'grid';

export interface SnapPoint {
  kind: SnapKind;
  p: Vec2;
}

export const entitySnapPoints = (e: Entity): SnapPoint[] => {
  const out: SnapPoint[] = [];
  const pushSegs = (segs: [Vec2, Vec2][]) => {
    for (const [a, b] of segs) {
      out.push({ kind: 'endpoint', p: a }, { kind: 'endpoint', p: b }, { kind: 'midpoint', p: mid(a, b) });
    }
  };
  switch (e.type) {
    case 'line':
      pushSegs([[e.a, e.b]]);
      break;
    case 'polyline':
      pushSegs(polyEdges(e.points, e.closed));
      break;
    case 'wall':
      pushSegs([[e.a, e.b]]);
      pushSegs(polyEdges(wallOutline(e), true));
      break;
    case 'circle':
      out.push({ kind: 'center', p: e.c });
      for (let k = 0; k < 4; k++) out.push({ kind: 'quadrant', p: add(e.c, fromPolar(e.r, (k * Math.PI) / 2)) });
      break;
    case 'arc': {
      const [p1, p2] = arcEndpoints(e);
      out.push({ kind: 'center', p: e.c }, { kind: 'endpoint', p: p1 }, { kind: 'endpoint', p: p2 });
      out.push({ kind: 'midpoint', p: add(e.c, fromPolar(e.r, e.start + arcSweep(e.start, e.end) / 2)) });
      break;
    }
    case 'slab':
      pushSegs(polyEdges(e.points, true));
      break;
    case 'roof': {
      pushSegs(polyEdges(roofOutline(e), true));
      const rg = roofGeometry(e);
      if (rg) pushSegs([rg.ridge]);
      break;
    }
    case 'text':
      out.push({ kind: 'endpoint', p: e.p });
      break;
    case 'dimension':
      out.push({ kind: 'endpoint', p: e.a }, { kind: 'endpoint', p: e.b });
      break;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Transformações
// ---------------------------------------------------------------------------

export const moveEntity = <E extends Entity>(e: E, d: Vec2): E => mapPoints(e, (p) => add(p, d));

export const rotateEntity = <E extends Entity>(e: E, c: Vec2, angle: number): E => {
  const moved = mapPoints(e, (p) => rotateAround(p, c, angle));
  if (moved.type === 'arc') return { ...moved, start: normAngle(moved.start + angle), end: normAngle(moved.end + angle) };
  if (moved.type === 'text') return { ...moved, rotation: moved.rotation + angle };
  return moved;
};

export const scaleEntity = <E extends Entity>(e: E, c: Vec2, f: number): E => {
  if (!(f > 0)) throw new Error('Fator de escala deve ser positivo.');
  const moved = mapPoints(e, (p) => scaleAround(p, c, f));
  switch (moved.type) {
    case 'circle':
    case 'arc':
      return { ...moved, r: moved.r * f };
    case 'text':
      return { ...moved, height: moved.height * f };
    case 'dimension':
      return { ...moved, offset: moved.offset * f };
    case 'wall':
      // espessura, altura e vãos são parâmetros construtivos: só a posição dos vãos acompanha o comprimento
      return moved.openings ? { ...moved, openings: moved.openings.map((o) => ({ ...o, offset: o.offset * f })) } : moved;
    default:
      return moved;
  }
};

export const mirrorEntity = <E extends Entity>(e: E, a: Vec2, b: Vec2): E => {
  const m = mapPoints(e, (p) => mirrorAcross(p, a, b));
  const axis = angleOf(sub(b, a));
  switch (m.type) {
    case 'arc':
      // reflexão inverte orientação: o novo arco vai de reflect(end) até reflect(start)
      return { ...m, start: normAngle(2 * axis - (e as ArcEntity).end), end: normAngle(2 * axis - (e as ArcEntity).start) };
    case 'dimension':
      return { ...m, offset: -m.offset };
    case 'wall':
      // a reflexão troca o lado de abertura das portas
      return m.openings ? { ...m, openings: m.openings.map((o) => ({ ...o, side: (o.side === 1 ? -1 : 1) as 1 | -1 })) } : m;
    case 'text':
      // texto espelhado mantém legibilidade (comportamento MIRRTEXT=0)
      return { ...m, p: mirrorAcross((e as TextEntity).p, a, b) };
    default:
      return m;
  }
};

const mapPoints = <E extends Entity>(e: E, f: (p: Vec2) => Vec2): E => {
  switch (e.type) {
    case 'line':
    case 'wall':
    case 'dimension':
      return { ...e, a: f(e.a), b: f(e.b) };
    case 'polyline':
    case 'slab':
    case 'roof':
      return { ...e, points: e.points.map(f) };
    case 'circle':
    case 'arc':
      return { ...e, c: f(e.c) };
    case 'text':
      return { ...e, p: f(e.p) };
  }
  return e;
};

// ---------------------------------------------------------------------------
// Medições
// ---------------------------------------------------------------------------

export const polygonArea = (pts: Vec2[]): number => {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += cross(pts[j], pts[i]);
  return Math.abs(s) / 2;
};

export const polylineLength = (pts: Vec2[], closed: boolean): number =>
  polyEdges(pts, closed).reduce((acc, [a, b]) => acc + dist(a, b), 0);

export interface Measure {
  length?: number;
  area?: number;
  perimeter?: number;
}

export const measureEntity = (e: Entity): Measure => {
  switch (e.type) {
    case 'line':
      return { length: dist(e.a, e.b) };
    case 'wall':
      return { length: dist(e.a, e.b), area: dist(e.a, e.b) * e.thickness };
    case 'polyline':
      return e.closed
        ? { area: polygonArea(e.points), perimeter: polylineLength(e.points, true) }
        : { length: polylineLength(e.points, false) };
    case 'circle':
      return { area: Math.PI * e.r * e.r, perimeter: 2 * Math.PI * e.r };
    case 'arc':
      return { length: e.r * arcSweep(e.start, e.end) };
    case 'dimension':
      return { length: dist(e.a, e.b) };
    case 'slab':
      return { area: polygonArea(e.points), perimeter: polylineLength(e.points, true) };
    case 'roof':
      return { area: polygonArea(roofOutline(e)) };
    case 'text':
      return {};
  }
};

// ---------------------------------------------------------------------------
// Explodir e deslocar (offset)
// ---------------------------------------------------------------------------

/** Explode a entidade em entidades mais simples; retorna null se não aplicável. */
export const explodeEntity = (e: Entity, makeId: () => string): Entity[] | null => {
  const base = { layerId: e.layerId, levelId: e.levelId };
  if (e.type === 'polyline') {
    return polyEdges(e.points, e.closed).map(([a, b]) => ({ ...base, id: makeId(), type: 'line', a, b }));
  }
  if (e.type === 'slab') {
    return polyEdges(e.points, true).map(([a, b]) => ({ ...base, id: makeId(), type: 'line', a, b }));
  }
  if (e.type === 'wall') {
    return polyEdges(wallOutline(e), true).map(([a, b]) => ({ ...base, id: makeId(), type: 'line', a, b }));
  }
  return null;
};

/** Lado (+1 esquerda / -1 direita) de p em relação ao segmento orientado ab. */
const sideOf = (a: Vec2, b: Vec2, p: Vec2): number => Math.sign(cross(sub(b, a), sub(p, a))) || 1;

/**
 * Desloca a entidade por `d` (mm) para o lado onde está `toward`.
 * Retorna null quando o resultado é degenerado (ex.: raio ≤ 0).
 */
export const offsetEntity = (e: Entity, d: number, toward: Vec2, id: string): Entity | null => {
  if (!(d > 0)) return null;
  switch (e.type) {
    case 'line': {
      const n = mul(perp(norm(sub(e.b, e.a))), d * sideOf(e.a, e.b, toward));
      return { ...e, id, a: add(e.a, n), b: add(e.b, n) };
    }
    case 'circle':
    case 'arc': {
      const outward = dist(toward, e.c) > e.r ? 1 : -1;
      const r = e.r + outward * d;
      return r > 1e-9 ? { ...e, id, r } : null;
    }
    case 'polyline': {
      const pts = offsetPolyline(e, d, toward);
      return pts ? { ...e, id, points: pts } : null;
    }
    default:
      return null;
  }
};

const offsetPolyline = (e: PolylineEntity, d: number, toward: Vec2): Vec2[] | null => {
  const pts = e.points;
  const n = pts.length;
  if (n < 2) return null;
  // escolhe o lado pelo segmento mais próximo do ponto de referência
  const edges = polyEdges(pts, e.closed);
  let bestI = 0;
  let bestD = Infinity;
  edges.forEach(([a, b], i) => {
    const dd = distToSegment(toward, a, b);
    if (dd < bestD) {
      bestD = dd;
      bestI = i;
    }
  });
  const side = sideOf(edges[bestI][0], edges[bestI][1], toward);
  const shifted = edges.map(([a, b]) => {
    const nrm = mul(perp(norm(sub(b, a))), d * side);
    return [add(a, nrm), add(b, nrm)] as [Vec2, Vec2];
  });
  const out: Vec2[] = [];
  const m = shifted.length;
  for (let i = 0; i < n; i++) {
    const prevIdx = e.closed ? (i - 1 + m) % m : i - 1;
    const nextIdx = i < m ? i : -1;
    const prev = prevIdx >= 0 ? shifted[prevIdx] : null;
    const next = nextIdx >= 0 ? shifted[nextIdx] : null;
    if (prev && next) {
      const r = lineLineParams(prev[0], prev[1], next[0], next[1]);
      out.push(r ? add(prev[0], mul(sub(prev[1], prev[0]), r.t)) : next[0]);
    } else if (next) out.push(next[0]);
    else if (prev) out.push(prev[1]);
  }
  return out;
};

export const entityLabel: Record<Entity['type'], string> = {
  line: 'Linha',
  polyline: 'Polilinha',
  circle: 'Círculo',
  arc: 'Arco',
  text: 'Texto',
  dimension: 'Cota',
  wall: 'Parede',
  slab: 'Piso',
  roof: 'Cobertura',
};

export const segmentLength = (a: Vec2, b: Vec2): number => len(sub(b, a));
