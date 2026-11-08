import { type Vec2, add, sub, mul, angleOf, normAngle, arcSweep, projectOnLine } from '../geometry/vec.ts';
import { type Prim, intersectPrims, lineLineParams, lineCircleParams, pointOnRoundPrim } from '../geometry/intersect.ts';
import type { Entity, LineEntity } from './types.ts';
import { entityPrims } from './entities.ts';

export type EditResult = { ok: true; replace: Entity[] } | { ok: false; reason: string };

const T_EPS = 1e-7;

/** Interseções entre a entidade-alvo e as arestas de corte. */
const cutPoints = (target: Entity, cutters: Entity[]): Vec2[] => {
  const tp = entityPrims(target);
  const pts: Vec2[] = [];
  for (const c of cutters) {
    if (c.id === target.id) continue;
    for (const cp of entityPrims(c)) for (const p of tp) pts.push(...intersectPrims(p, cp));
  }
  return pts;
};

/**
 * TRIM: remove o trecho da entidade que contém `pick`, delimitado pelas
 * interseções mais próximas com `cutters`. Suporta linha, arco e círculo.
 */
export const trimEntity = (target: Entity, cutters: Entity[], pick: Vec2, makeId: () => string): EditResult => {
  const pts = cutPoints(target, cutters);
  if (target.type === 'line') {
    const ab = sub(target.b, target.a);
    const ts = pts
      .map((p) => projectOnLine(p, target.a, target.b).t)
      .filter((t) => t > T_EPS && t < 1 - T_EPS)
      .sort((x, y) => x - y);
    if (ts.length === 0) return { ok: false, reason: 'Nenhuma interseção com outras entidades nesta linha.' };
    const t0 = projectOnLine(pick, target.a, target.b).t;
    const below = ts.filter((t) => t < t0);
    const above = ts.filter((t) => t > t0);
    const tl = below.length ? below[below.length - 1] : null;
    const tr = above.length ? above[0] : null;
    const at = (t: number) => add(target.a, mul(ab, t));
    const out: Entity[] = [];
    if (tl !== null) out.push({ ...target, b: at(tl) });
    if (tr !== null) out.push({ ...target, id: tl !== null ? makeId() : target.id, a: at(tr) });
    return { ok: true, replace: out };
  }
  if (target.type === 'arc' || target.type === 'circle') {
    const start = target.type === 'arc' ? target.start : 0;
    const sweep = target.type === 'arc' ? arcSweep(target.start, target.end) : Math.PI * 2;
    const rel = (p: Vec2) => normAngle(angleOf(sub(p, target.c)) - start);
    const params = [...new Set(pts.map((p) => Math.round(rel(p) * 1e9) / 1e9))]
      .filter((a) => (target.type === 'circle' ? true : a > T_EPS && a < sweep - T_EPS))
      .sort((x, y) => x - y);
    const a0 = rel(pick);
    if (target.type === 'circle') {
      if (params.length < 2) return { ok: false, reason: 'Círculo precisa de ao menos duas interseções para ser aparado.' };
      // trecho removido: entre a interseção anterior e a seguinte ao ponto escolhido (cíclico)
      let next = params.find((a) => a > a0);
      let prev = [...params].reverse().find((a) => a < a0);
      if (next === undefined) next = params[0];
      if (prev === undefined) prev = params[params.length - 1];
      return {
        ok: true,
        replace: [
          { id: target.id, layerId: target.layerId, levelId: target.levelId, type: 'arc', c: target.c, r: target.r, start: normAngle(next), end: normAngle(prev) },
        ],
      };
    }
    if (params.length === 0) return { ok: false, reason: 'Nenhuma interseção com outras entidades neste arco.' };
    const below = params.filter((a) => a < a0);
    const above = params.filter((a) => a > a0);
    const tl = below.length ? below[below.length - 1] : null;
    const tr = above.length ? above[0] : null;
    const out: Entity[] = [];
    if (tl !== null) out.push({ ...target, end: normAngle(start + tl) });
    if (tr !== null) out.push({ ...target, id: tl !== null ? makeId() : target.id, start: normAngle(start + tr) });
    return { ok: true, replace: out };
  }
  return { ok: false, reason: 'Aparar suporta linhas, arcos e círculos. Exploda polilinhas antes.' };
};

/** Parâmetros t (ao longo da reta infinita ab) onde ela cruza a primitiva limitada. */
const rayHits = (a: Vec2, b: Vec2, prim: Prim): number[] => {
  if (prim.kind === 'seg') {
    const r = lineLineParams(a, b, prim.a, prim.b);
    return r && r.u >= -1e-9 && r.u <= 1 + 1e-9 ? [r.t] : [];
  }
  return lineCircleParams(a, b, prim.c, prim.r).filter((t) => pointOnRoundPrim(add(a, mul(sub(b, a), t)), prim));
};

/**
 * EXTEND: prolonga a extremidade da linha mais próxima de `pick` até a
 * primeira fronteira encontrada.
 */
export const extendEntity = (target: Entity, boundaries: Entity[], pick: Vec2): EditResult => {
  if (target.type !== 'line') return { ok: false, reason: 'Estender suporta apenas linhas nesta versão.' };
  const line = target as LineEntity;
  const tPick = projectOnLine(pick, line.a, line.b).t;
  const extendB = tPick >= 0.5;
  const hits: number[] = [];
  for (const bnd of boundaries) {
    if (bnd.id === line.id) continue;
    for (const prim of entityPrims(bnd)) hits.push(...rayHits(line.a, line.b, prim));
  }
  const candidates = extendB ? hits.filter((t) => t > 1 + T_EPS).sort((x, y) => x - y) : hits.filter((t) => t < -T_EPS).sort((x, y) => y - x);
  if (candidates.length === 0) return { ok: false, reason: 'Nenhuma fronteira encontrada na direção da extremidade.' };
  const p = add(line.a, mul(sub(line.b, line.a), candidates[0]));
  return { ok: true, replace: [extendB ? { ...line, b: p } : { ...line, a: p }] };
};
