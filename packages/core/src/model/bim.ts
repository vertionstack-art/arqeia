import { type Vec2, add, sub, mul, dot, cross, dist, mid, norm, perp, angleOf, closestOnSegment } from '../geometry/vec.js';
import type { Entity, Id, Level, Opening, Project, RoofEntity, SlabEntity, WallEntity } from './types.js';

/**
 * Elementos BIM (Fase 3): junções de paredes, aberturas hospedadas, pisos,
 * cobertura de duas águas e a malha 3D derivada do modelo. Tudo é função pura
 * do projeto: a planta e o 3D são duas leituras do mesmo dado.
 */

/** Tolerância para considerar dois pontos de eixo como o mesmo nó (mm). */
export const JOIN_TOLERANCE = 1;

// ---------------------------------------------------------------------------
// Junções de paredes
// ---------------------------------------------------------------------------

export interface ResolvedOpening {
  opening: Opening;
  /** Início e fim do vão ao longo do eixo (mm a partir de `a`). */
  s0: number;
  s1: number;
  valid: boolean;
}

export interface WallGeometry {
  wall: WallEntity;
  length: number;
  dir: Vec2;
  /** Normal à esquerda de a→b. */
  n: Vec2;
  /** Parâmetros ao longo do eixo onde cada face começa/termina após as junções. */
  ls: number;
  rs: number;
  le: number;
  re: number;
  /** Contorno unido: [esq-início, esq-fim, dir-fim, dir-início]. */
  outline: Vec2[];
  openings: ResolvedOpening[];
  /** Trechos de altura total entre os vãos. */
  pieces: { s0: number; s1: number }[];
}

/** Ponto na face da parede: t ao longo do eixo, side +1 esquerda / -1 direita. */
export const wallPoint = (g: Pick<WallGeometry, 'wall' | 'dir' | 'n'>, t: number, side: number): Vec2 =>
  add(add(g.wall.a, mul(g.dir, t)), mul(g.n, (side * g.wall.thickness) / 2));

interface Spoke {
  wall: WallEntity;
  /** Direção saindo do nó ao longo da parede. */
  d: Vec2;
}

/** Interseção da reta p + d·t com a reta q + e·u; devolve t ou null se paralelas. */
const rayParam = (p: Vec2, d: Vec2, q: Vec2, e: Vec2): number | null => {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  return cross(sub(q, p), e) / den;
};

const dirOf = (w: WallEntity): Vec2 => norm(sub(w.b, w.a));

/**
 * Recuo/avanço de cada face numa extremidade.
 * Devolve [tEsquerdaSaída, tDireitaSaída] medidos a partir do nó, ao longo da direção de saída.
 */
const endJoin = (w: WallEntity, node: Vec2, d: Vec2, other: Vec2, walls: WallEntity[]): [number, number] => {
  const half = w.thickness / 2;
  const left = add(node, mul(perp(d), half));
  const right = sub(node, mul(perp(d), half));
  const limit = 4 * w.thickness;

  // 1) nó compartilhado (L, cruz, Y): faces se encontram com as vizinhas angulares
  const spokes: Spoke[] = [{ wall: w, d }];
  for (const o of walls) {
    if (o.id === w.id) continue;
    if (dist(o.a, node) <= JOIN_TOLERANCE) spokes.push({ wall: o, d: dirOf(o) });
    else if (dist(o.b, node) <= JOIN_TOLERANCE) spokes.push({ wall: o, d: mul(dirOf(o), -1) });
  }
  if (spokes.length > 1) {
    const ang = (s: Spoke) => angleOf(s.d);
    const a0 = ang(spokes[0]);
    const rel = (s: Spoke) => {
      let r = ang(s) - a0;
      while (r <= 1e-9) r += 2 * Math.PI;
      return r;
    };
    const others = spokes.slice(1).sort((x, y) => rel(x) - rel(y));
    const ccw = others[0];
    const cw = others[others.length - 1];
    const meet = (from: Vec2, nb: Spoke, nbSide: 1 | -1): number => {
      // paralela na mesma reta (continuação): sem recorte
      if (Math.abs(cross(d, nb.d)) < 1e-6) return 0;
      const q = add(node, mul(perp(nb.d), (nbSide * nb.wall.thickness) / 2));
      const t = rayParam(from, d, q, nb.d);
      return t === null || Math.abs(t) > limit ? 0 : t;
    };
    // face esquerda encontra a face direita da vizinha anti-horária; direita encontra a esquerda da horária
    return [meet(left, ccw, -1), meet(right, cw, 1)];
  }

  // 2) T: o nó cai no meio de outra parede → termina na face dela
  for (const h of walls) {
    if (h.id === w.id) continue;
    const { point, t } = closestOnSegment(node, h.a, h.b);
    const L = dist(h.a, h.b);
    if (dist(point, node) > JOIN_TOLERANCE || t * L <= JOIN_TOLERANCE || (1 - t) * L <= JOIN_TOLERANCE) continue;
    const hd = dirOf(h);
    const s = Math.sign(cross(hd, sub(other, h.a))) || 1;
    const q = add(h.a, mul(perp(hd), (s * h.thickness) / 2));
    const tl = rayParam(left, d, q, hd);
    const tr = rayParam(right, d, q, hd);
    if (tl === null || tr === null) continue;
    return [Math.abs(tl) > limit ? 0 : tl, Math.abs(tr) > limit ? 0 : tr];
  }
  return [0, 0];
};

export const resolveOpenings = (w: WallEntity, length = dist(w.a, w.b)): ResolvedOpening[] => {
  const list = [...(w.openings ?? [])]
    .map((o) => ({ opening: o, s0: o.offset - o.width / 2, s1: o.offset + o.width / 2, valid: true }))
    .sort((x, y) => x.s0 - y.s0);
  let lastEnd = -Infinity;
  for (const r of list) {
    const o = r.opening;
    const fits =
      o.width > 0 &&
      o.height > 0 &&
      o.sill >= 0 &&
      r.s0 >= -1e-6 &&
      r.s1 <= length + 1e-6 &&
      o.sill + o.height <= w.height + 1e-6 &&
      r.s0 >= lastEnd - 1e-6;
    r.valid = fits;
    if (fits) lastEnd = r.s1;
  }
  return list;
};

/** Geometria de cada parede do conjunto, com junções e vãos. */
export const wallGeometry = (walls: WallEntity[]): Map<Id, WallGeometry> => {
  const out = new Map<Id, WallGeometry>();
  for (const w of walls) {
    const length = dist(w.a, w.b);
    if (length < 1e-6) continue;
    const dir = dirOf(w);
    const n = perp(dir);
    const [sl, sr] = endJoin(w, w.a, dir, w.b, walls);
    const [el, er] = endJoin(w, w.b, mul(dir, -1), w.a, walls);
    // na extremidade final, a "esquerda de saída" é a face direita da parede
    const ls = sl;
    const rs = sr;
    const le = length - er;
    const re = length - el;
    const g: WallGeometry = { wall: w, length, dir, n, ls, rs, le, re, outline: [], openings: resolveOpenings(w, length), pieces: [] };
    g.outline = [wallPoint(g, ls, 1), wallPoint(g, le, 1), wallPoint(g, re, -1), wallPoint(g, rs, -1)];
    let cur = 0;
    for (const r of g.openings) {
      if (!r.valid) continue;
      if (r.s0 > cur + 1e-6) g.pieces.push({ s0: cur, s1: r.s0 });
      cur = r.s1;
    }
    if (length > cur + 1e-6) g.pieces.push({ s0: cur, s1: length });
    out.set(w.id, g);
  }
  return out;
};

/** Polígono de um trecho [s0, s1] da parede, usando as junções nas extremidades. */
export const wallPiecePolygon = (g: WallGeometry, s0: number, s1: number): Vec2[] => {
  const atStart = s0 <= 1e-6;
  const atEnd = s1 >= g.length - 1e-6;
  return [
    wallPoint(g, atStart ? g.ls : s0, 1),
    wallPoint(g, atEnd ? g.le : s1, 1),
    wallPoint(g, atEnd ? g.re : s1, -1),
    wallPoint(g, atStart ? g.rs : s0, -1),
  ];
};

// ---------------------------------------------------------------------------
// Aberturas: criação, validação e símbolo em planta
// ---------------------------------------------------------------------------

export const OPENING_DEFAULTS: Record<Opening['kind'], Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 800, height: 2100, sill: 0 },
  window: { width: 1200, height: 1200, sill: 1000 },
};

export interface OpeningIssue {
  openingId: Id;
  message: string;
}

export const openingIssues = (w: WallEntity): OpeningIssue[] => {
  const L = dist(w.a, w.b);
  const out: OpeningIssue[] = [];
  for (const r of resolveOpenings(w, L)) {
    if (r.valid) continue;
    const o = r.opening;
    const name = o.kind === 'door' ? 'Porta' : 'Janela';
    let msg = `${name} não cabe na parede`;
    if (o.width <= 0 || o.height <= 0) msg = `${name} com dimensão inválida`;
    else if (o.sill + o.height > w.height) msg = `${name} ultrapassa a altura da parede`;
    else if (r.s0 < 0 || r.s1 > L) msg = `${name} sai do comprimento da parede`;
    else msg = `${name} sobrepõe outra abertura`;
    out.push({ openingId: o.id, message: msg });
  }
  return out;
};

/**
 * Posição de uma nova abertura centrada na projeção de `p` sobre a parede,
 * ajustada para caber (ou null se a parede for curta demais).
 */
export const placeOpening = (w: WallEntity, p: Vec2, width: number): number | null => {
  const L = dist(w.a, w.b);
  if (width > L) return null;
  const t = dot(sub(p, w.a), dirOf(w));
  return Math.min(L - width / 2, Math.max(width / 2, t));
};

/** Vão livre para uma abertura nova (sem sobrepor as válidas existentes). */
export const openingFits = (w: WallEntity, offset: number, width: number, ignoreId?: Id): boolean => {
  const L = dist(w.a, w.b);
  const s0 = offset - width / 2;
  const s1 = offset + width / 2;
  if (s0 < -1e-6 || s1 > L + 1e-6) return false;
  return !(w.openings ?? []).some((o) => o.id !== ignoreId && s0 < o.offset + o.width / 2 - 1e-6 && s1 > o.offset - o.width / 2 + 1e-6);
};

export interface PlanSymbol {
  lines: [Vec2, Vec2][];
  arcs: { c: Vec2; r: number; start: number; end: number }[];
}

/** Símbolo de planta: folha e arco de giro (porta) ou linhas de caixilho (janela). */
export const openingSymbol = (g: WallGeometry, r: ResolvedOpening): PlanSymbol => {
  const o = r.opening;
  const half = g.wall.thickness / 2;
  if (o.kind === 'window') {
    const lines: [Vec2, Vec2][] = [
      [wallPoint(g, r.s0, 1), wallPoint(g, r.s0, -1)],
      [wallPoint(g, r.s1, 1), wallPoint(g, r.s1, -1)],
      [wallPoint(g, r.s0, 0.15), wallPoint(g, r.s1, 0.15)],
      [wallPoint(g, r.s0, -0.15), wallPoint(g, r.s1, -0.15)],
    ];
    return { lines, arcs: [] };
  }
  const hingeT = o.hinge === 'start' ? r.s0 : r.s1;
  const freeT = o.hinge === 'start' ? r.s1 : r.s0;
  const hinge = add(add(g.wall.a, mul(g.dir, hingeT)), mul(g.n, o.side * half));
  const along = mul(g.dir, freeT - hingeT);
  const leafEnd = add(hinge, mul(g.n, o.side * o.width));
  const closed = add(hinge, along);
  const a1 = angleOf(sub(closed, hinge));
  const a2 = angleOf(sub(leafEnd, hinge));
  // arco sempre anti-horário de start a end
  const ccw = cross(sub(closed, hinge), sub(leafEnd, hinge)) > 0;
  return {
    lines: [
      [hinge, leafEnd],
      [wallPoint(g, r.s0, 1), wallPoint(g, r.s0, -1)],
      [wallPoint(g, r.s1, 1), wallPoint(g, r.s1, -1)],
    ],
    arcs: [{ c: hinge, r: o.width, start: ccw ? a1 : a2, end: ccw ? a2 : a1 }],
  };
};

// ---------------------------------------------------------------------------
// Cobertura de duas águas
// ---------------------------------------------------------------------------

export interface RoofGeometry {
  /** Contorno externo com beiral (planta). */
  outline: Vec2[];
  ridge: [Vec2, Vec2];
  /** Cotas relativas ao pavimento (mm). */
  eaveZ: number;
  ridgeZ: number;
  span: number;
  length: number;
}

export const roofGeometry = (r: Pick<RoofEntity, 'points' | 'pitch' | 'overhang' | 'baseOffset'>): RoofGeometry | null => {
  if (r.points.length !== 4) return null;
  const [p0, p1, , p3] = r.points;
  const u = sub(p1, p0);
  const v = sub(p3, p0);
  const length = Math.hypot(u.x, u.y);
  const span = Math.hypot(v.x, v.y);
  if (length < 1 || span < 1) return null;
  const uh = norm(u);
  const vh = norm(v);
  const o = r.overhang;
  const k = r.pitch / 100;
  const q0 = sub(sub(p0, mul(uh, o)), mul(vh, o));
  const q1 = sub(add(p0, add(u, mul(uh, o))), mul(vh, o));
  const q2 = add(add(p0, add(u, mul(uh, o))), add(v, mul(vh, o)));
  const q3 = add(sub(p0, mul(uh, o)), add(v, mul(vh, o)));
  const m0 = mid(q0, q3);
  const m1 = mid(q1, q2);
  return {
    outline: [q0, q1, q2, q3],
    ridge: [m0, m1],
    eaveZ: r.baseOffset - o * k,
    ridgeZ: r.baseOffset + (span / 2) * k,
    span,
    length,
  };
};

// ---------------------------------------------------------------------------
// Triangulação (ear clipping) para pisos côncavos
// ---------------------------------------------------------------------------

const signedArea = (pts: Vec2[]): number => {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += cross(pts[j], pts[i]);
  return s / 2;
};

const inTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean => {
  const d1 = cross(sub(b, a), sub(p, a));
  const d2 = cross(sub(c, b), sub(p, b));
  const d3 = cross(sub(a, c), sub(p, c));
  return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9;
};

/** Triângulos (índices no polígono, sentido anti-horário). */
export const triangulate = (input: Vec2[]): [number, number, number][] => {
  const n = input.length;
  if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (signedArea(input) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = input[ia];
      const b = input[ib];
      const c = input[ic];
      if (cross(sub(b, a), sub(c, b)) <= 1e-9) continue; // vértice reflexo
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inTriangle(input[j], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // polígono degenerado/auto-intersectante
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
};

// ---------------------------------------------------------------------------
// Malha 3D derivada do modelo
// ---------------------------------------------------------------------------

export type MeshKind = 'wall' | 'slab' | 'roof' | 'door' | 'glass' | 'frame' | 'gable';

/** Malha em mm, eixo Z para cima (x, y da planta). Vértices não compartilhados entre faces (sombreamento plano). */
export interface MeshPart {
  entityId: Id;
  kind: MeshKind;
  positions: number[];
}

type V3 = [number, number, number];

const pushTri = (out: number[], a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);

/** Prisma vertical de um polígono simples, de z0 a z1. */
const prism = (out: number[], poly: Vec2[], z0: number, z1: number) => {
  if (z1 - z0 < 1e-6 || poly.length < 3) return;
  const ccw = signedArea(poly) > 0 ? poly : [...poly].reverse();
  for (const [i, j, k] of triangulate(ccw)) {
    const [a, b, c] = [ccw[i], ccw[j], ccw[k]];
    pushTri(out, [a.x, a.y, z1], [b.x, b.y, z1], [c.x, c.y, z1]);
    pushTri(out, [a.x, a.y, z0], [c.x, c.y, z0], [b.x, b.y, z0]);
  }
  for (let i = 0; i < ccw.length; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % ccw.length];
    pushTri(out, [a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1]);
    pushTri(out, [a.x, a.y, z0], [b.x, b.y, z1], [a.x, a.y, z1]);
  }
};

/** Caixa orientada ao longo da parede: [t0,t1] no eixo, [w0,w1] na normal (mm), [z0,z1]. */
const wallBox = (out: number[], g: WallGeometry, t0: number, t1: number, w0: number, w1: number, z0: number, z1: number) => {
  const P = (t: number, w: number) => add(add(g.wall.a, mul(g.dir, t)), mul(g.n, w));
  prism(out, [P(t0, w0), P(t1, w0), P(t1, w1), P(t0, w1)], z0, z1);
};

const levelElevation = (levels: Map<Id, Level>, id: Id): number => levels.get(id)?.elevation ?? 0;

export interface ModelMesh {
  parts: MeshPart[];
  /** Avisos de modelagem (aberturas que não cabem, polígonos inválidos). */
  issues: string[];
}

/** Gera a malha 3D de todo o projeto (ou só dos pavimentos indicados). */
export const buildModelMesh = (project: Project, opts: { levelIds?: Id[] } = {}): ModelMesh => {
  const levels = new Map(project.levels.map((l) => [l.id, l]));
  const hidden = new Set(project.layers.filter((l) => !l.visible).map((l) => l.id));
  const wanted = opts.levelIds ? new Set(opts.levelIds) : null;
  const ents = Object.values(project.entities).filter((e) => !hidden.has(e.layerId) && (!wanted || wanted.has(e.levelId)));
  const parts: MeshPart[] = [];
  const issues: string[] = [];

  // paredes por pavimento (junções só entre paredes do mesmo pavimento)
  const byLevel = new Map<Id, WallEntity[]>();
  for (const e of ents) if (e.type === 'wall') byLevel.set(e.levelId, [...(byLevel.get(e.levelId) ?? []), e]);
  for (const [levelId, walls] of byLevel) {
    const z = levelElevation(levels, levelId);
    for (const g of wallGeometry(walls).values()) {
      const w = g.wall;
      const base = z + (w.baseOffset ?? 0);
      const top = base + w.height;
      const solid: number[] = [];
      for (const p of g.pieces) prism(solid, wallPiecePolygon(g, p.s0, p.s1), base, top);
      const half = w.thickness / 2;
      const door: number[] = [];
      const glass: number[] = [];
      const frame: number[] = [];
      for (const r of g.openings) {
        if (!r.valid) {
          issues.push(openingIssues(w).find((i) => i.openingId === r.opening.id)?.message ?? 'Abertura inválida');
          continue;
        }
        const o = r.opening;
        const s0 = r.s0 <= 1e-6 ? undefined : r.s0;
        const s1 = r.s1 >= g.length - 1e-6 ? undefined : r.s1;
        // peitoril e verga: trechos da parede abaixo e acima do vão
        const poly = wallPiecePolygon(g, s0 ?? 0, s1 ?? g.length);
        prism(solid, poly, base, base + o.sill);
        prism(solid, poly, base + o.sill + o.height, top);
        const zb = base + o.sill;
        const zt = zb + o.height;
        if (o.kind === 'door') {
          wallBox(door, g, r.s0 + 10, r.s1 - 10, -20, 20, zb, zt - 10);
        } else {
          const f = Math.min(50, o.width / 6, o.height / 6);
          wallBox(frame, g, r.s0, r.s1, -half * 0.3, half * 0.3, zb, zb + f);
          wallBox(frame, g, r.s0, r.s1, -half * 0.3, half * 0.3, zt - f, zt);
          wallBox(frame, g, r.s0, r.s0 + f, -half * 0.3, half * 0.3, zb + f, zt - f);
          wallBox(frame, g, r.s1 - f, r.s1, -half * 0.3, half * 0.3, zb + f, zt - f);
          wallBox(glass, g, r.s0 + f, r.s1 - f, -4, 4, zb + f, zt - f);
        }
      }
      parts.push({ entityId: w.id, kind: 'wall', positions: solid });
      if (door.length) parts.push({ entityId: w.id, kind: 'door', positions: door });
      if (frame.length) parts.push({ entityId: w.id, kind: 'frame', positions: frame });
      if (glass.length) parts.push({ entityId: w.id, kind: 'glass', positions: glass });
    }
  }

  for (const e of ents) {
    const z = levelElevation(levels, e.levelId);
    if (e.type === 'slab') {
      const out: number[] = [];
      const top = z + e.offset;
      if (triangulate(e.points).length < e.points.length - 2) issues.push('Piso com contorno inválido (auto-interseção).');
      prism(out, e.points, top - e.thickness, top);
      parts.push({ entityId: e.id, kind: 'slab', positions: out });
    } else if (e.type === 'roof') {
      const rg = roofGeometry(e);
      if (!rg) {
        issues.push('Cobertura com contorno inválido.');
        continue;
      }
      const out: number[] = [];
      const gable: number[] = [];
      const [q0, q1, q2, q3] = rg.outline;
      const [m0, m1] = rg.ridge;
      const ze = z + rg.eaveZ;
      const zr = z + rg.ridgeZ;
      const t = e.thickness;
      // cada água como placa com espessura vertical t
      const plate = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, za: number, zc: number) => {
        const top: V3[] = [
          [a.x, a.y, za],
          [b.x, b.y, za],
          [c.x, c.y, zc],
          [d.x, d.y, zc],
        ];
        const bot = top.map(([x, y, zz]) => [x, y, zz - t] as V3);
        const quad = (p: V3[], flip: boolean) => {
          if (flip) {
            pushTri(out, p[0], p[2], p[1]);
            pushTri(out, p[0], p[3], p[2]);
          } else {
            pushTri(out, p[0], p[1], p[2]);
            pushTri(out, p[0], p[2], p[3]);
          }
        };
        quad(top, false);
        quad(bot, true);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          quad([top[i], top[j], bot[j], bot[i]], true);
        }
      };
      // garante face superior voltada para cima (anti-horária vista de cima)
      const up = (a: Vec2, b: Vec2, c: Vec2) => cross(sub(b, a), sub(c, a)) > 0;
      if (up(q0, q1, m1)) plate(q0, q1, m1, m0, ze, zr);
      else plate(q1, q0, m0, m1, ze, zr);
      if (up(q2, q3, m0)) plate(q2, q3, m0, m1, ze, zr);
      else plate(q3, q2, m1, m0, ze, zr);
      // oitões: triângulos sobre as paredes das empenas (linha p0-p3 e p1-p2)
      const [p0, p1, p2, p3] = e.points;
      const zb = z + e.baseOffset;
      const zt = z + e.baseOffset + (rg.span / 2) * (e.pitch / 100);
      for (const [a, b] of [
        [p0, p3],
        [p1, p2],
      ] as [Vec2, Vec2][]) {
        const m = mid(a, b);
        const A: V3 = [a.x, a.y, zb];
        const B: V3 = [b.x, b.y, zb];
        const M: V3 = [m.x, m.y, zt - t];
        pushTri(gable, A, B, M);
        pushTri(gable, A, M, B);
      }
      parts.push({ entityId: e.id, kind: 'roof', positions: out });
      parts.push({ entityId: e.id, kind: 'gable', positions: gable });
    }
  }
  return { parts, issues };
};

/** Caixa envolvente 3D (mm) de uma malha. */
export const meshBounds = (parts: MeshPart[]): { min: V3; max: V3 } | null => {
  let min: V3 = [Infinity, Infinity, Infinity];
  let max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < p.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p.positions[i + k]);
        max[k] = Math.max(max[k], p.positions[i + k]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
};

// ---------------------------------------------------------------------------
// Propriedades BIM (quantitativos por elemento)
// ---------------------------------------------------------------------------

export interface WallQuantities {
  length: number;
  /** Área de uma face, descontados os vãos válidos (m² × 1e6 → mm²). */
  netArea: number;
  grossArea: number;
  volume: number;
  doors: number;
  windows: number;
}

export const wallQuantities = (w: WallEntity): WallQuantities => {
  const L = dist(w.a, w.b);
  const ops = resolveOpenings(w, L).filter((r) => r.valid);
  const voids = ops.reduce((s, r) => s + r.opening.width * r.opening.height, 0);
  const gross = L * w.height;
  return {
    length: L,
    grossArea: gross,
    netArea: gross - voids,
    volume: (gross - voids) * w.thickness,
    doors: ops.filter((r) => r.opening.kind === 'door').length,
    windows: ops.filter((r) => r.opening.kind === 'window').length,
  };
};

export const slabArea = (s: SlabEntity): number => Math.abs(signedArea(s.points));

/** Migra projetos antigos para o schema atual (v1 → v2: só muda a versão; campos novos são opcionais). */
export const migrateProject = (p: Project): Project => (p.schemaVersion >= 2 ? p : { ...p, schemaVersion: 2 });

/** Paredes de um pavimento (para junções na planta). */
export const wallsOnLevel = (p: Project, levelId: Id): WallEntity[] =>
  Object.values(p.entities).filter((e): e is WallEntity => e.type === 'wall' && e.levelId === levelId);

export const isBimEntity = (e: Entity): boolean => e.type === 'wall' || e.type === 'slab' || e.type === 'roof';

// ---------------------------------------------------------------------------
// Paredes unidas acompanham a edição
// ---------------------------------------------------------------------------

type EntityChange = { collection: 'entities'; id: Id; before: Entity | null; after: Entity | null };

/** Recalcula o centro das aberturas para que fiquem no mesmo lugar quando o início da parede muda. */
const keepOpeningsInPlace = (old: WallEntity, next: WallEntity): Opening[] | undefined => {
  if (!old.openings?.length) return old.openings;
  const d0 = dirOf(old);
  const d1 = dirOf(next);
  return old.openings.map((o) => {
    const center = add(old.a, mul(d0, o.offset));
    return { ...o, offset: dot(sub(center, next.a), d1) };
  });
};

/**
 * Quando paredes mudam de posição, as extremidades de outras paredes que estavam
 * unidas a elas (canto compartilhado ou T) acompanham. Devolve as alterações extras,
 * que entram na MESMA transação (um único desfazer).
 */
export const propagateWallJoins = (project: Project, changes: { collection: string; id: Id; before: unknown; after: unknown }[]): EntityChange[] => {
  const touched = new Set(changes.filter((c) => c.collection === 'entities').map((c) => c.id));
  const updated = new Map<Id, WallEntity>();
  for (const c of changes) {
    if (c.collection !== 'entities') continue;
    const oldW = c.before as Entity | null;
    const newW = c.after as Entity | null;
    if (!oldW || !newW || oldW.type !== 'wall' || newW.type !== 'wall' || oldW.levelId !== newW.levelId) continue;
    if (dist(oldW.a, newW.a) < 1e-6 && dist(oldW.b, newW.b) < 1e-6) continue;
    const oldLen = dist(oldW.a, oldW.b);
    for (const o of Object.values(project.entities)) {
      if (o.type !== 'wall' || o.levelId !== oldW.levelId || touched.has(o.id)) continue;
      const cur = updated.get(o.id) ?? o;
      const follow = (p: Vec2, other: Vec2): Vec2 | null => {
        if (dist(p, oldW.a) <= JOIN_TOLERANCE) return newW.a;
        if (dist(p, oldW.b) <= JOIN_TOLERANCE) return newW.b;
        const { point, t } = closestOnSegment(p, oldW.a, oldW.b);
        if (dist(point, p) > JOIN_TOLERANCE || t * oldLen <= JOIN_TOLERANCE || (1 - t) * oldLen <= JOIN_TOLERANCE) return null;
        // T: prolonga/encurta a parede ao longo da própria direção até o novo eixo
        const d = sub(p, other);
        const e = sub(newW.b, newW.a);
        const den = cross(d, e);
        if (Math.abs(den) < 1e-9) return null;
        return add(other, mul(d, cross(sub(newW.a, other), e) / den));
      };
      const na = follow(cur.a, cur.b);
      const nb = follow(cur.b, cur.a);
      if (!na && !nb) continue;
      const next: WallEntity = { ...cur, a: na ?? cur.a, b: nb ?? cur.b };
      if (dist(next.a, next.b) < 1) continue; // não colapsa paredes
      next.openings = keepOpeningsInPlace(cur, next);
      updated.set(o.id, next);
    }
  }
  return [...updated].map(([id, w]) => ({ collection: 'entities' as const, id, before: project.entities[id], after: w }));
};
