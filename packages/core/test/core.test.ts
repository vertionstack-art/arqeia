import { describe, it, expect } from 'vitest';
import {
  v,
  dist,
  segSeg,
  circleCircle,
  intersectPrims,
  parseLength,
  formatLength,
  parsePointInput,
  createProject,
  createDemoProject,
  assertProjectIntegrity,
  trimEntity,
  extendEntity,
  offsetEntity,
  mirrorEntity,
  rotateEntity,
  scaleEntity,
  moveEntity,
  measureEntity,
  entityBBox,
  entityDistance,
  findSnap,
  defaultSnapSettings,
  applyOrtho,
  SpatialIndex,
  History,
  applyChanges,
  addEntity,
  updateEntity,
  removeEntity,
  explodeEntity,
  wallOutline,
  type Entity,
  type LineEntity,
  type ArcEntity,
} from '../src/index.ts';

const base = { layerId: 'L', levelId: 'V' };
let n = 0;
const id = () => `e${++n}`;
const line = (ax: number, ay: number, bx: number, by: number): LineEntity => ({ ...base, id: id(), type: 'line', a: v(ax, ay), b: v(bx, by) });
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('unidades', () => {
  it('converte com sufixo e unidade padrão', () => {
    expect(parseLength('2.5', 'm')).toBe(2500);
    expect(parseLength('2,5m', 'mm')).toBe(2500);
    expect(parseLength('80cm', 'm')).toBe(800);
    expect(parseLength('1ft', 'm')).toBeCloseTo(304.8);
    expect(parseLength('abc', 'm')).toBeNull();
  });
  it('formata sem -0', () => {
    expect(formatLength(-0.0001, 'm')).toBe('0.00 m');
    expect(formatLength(2800, 'm')).toBe('2.80 m');
  });
});

describe('entrada de coordenadas', () => {
  it('absoluta, relativa, polar e distância', () => {
    expect(parsePointInput('3,4', null, 'm')).toEqual({ kind: 'point', point: { x: 3000, y: 4000 } });
    expect(parsePointInput('@2,0', v(1000, 1000), 'm')).toEqual({ kind: 'point', point: { x: 3000, y: 1000 } });
    const polar = parsePointInput('@5<90', v(0, 0), 'm');
    expect(polar.kind).toBe('point');
    if (polar.kind === 'point') {
      close(polar.point.x, 0);
      close(polar.point.y, 5000);
    }
    expect(parsePointInput('2.5', null, 'm')).toEqual({ kind: 'distance', distance: 2500 });
    expect(parsePointInput('2,5;1', null, 'm')).toEqual({ kind: 'point', point: { x: 2500, y: 1000 } });
    expect(parsePointInput('@1,1', null, 'm').kind).toBe('error');
  });
});

describe('interseções', () => {
  it('segmento × segmento', () => {
    expect(segSeg(v(0, 0), v(10, 10), v(0, 10), v(10, 0))).toEqual([v(5, 5)]);
    expect(segSeg(v(0, 0), v(1, 0), v(0, 1), v(1, 1))).toEqual([]);
  });
  it('círculo × círculo e segmento × arco', () => {
    expect(circleCircle(v(0, 0), 5, v(8, 0), 5)).toHaveLength(2);
    const pts = intersectPrims({ kind: 'seg', a: v(-10, 0), b: v(10, 0) }, { kind: 'arc', c: v(0, 0), r: 5, start: 0, end: Math.PI / 2 });
    expect(pts).toHaveLength(1);
    close(pts[0].x, 5);
  });
});

describe('projeto', () => {
  it('cria projeto íntegro em mm', () => {
    const p = createProject({ name: ' Casa ', siteWidth: 12, siteDepth: 25, units: 'm', levelCount: 2 });
    expect(p.meta.name).toBe('Casa');
    expect(p.site).toEqual({ width: 12000, depth: 25000 });
    expect(p.levels).toHaveLength(2);
    expect(assertProjectIntegrity(p)).toEqual([]);
  });
  it('projeto demo é íntegro e marcado', () => {
    const p = createDemoProject();
    expect(p.meta.isDemo).toBe(true);
    expect(assertProjectIntegrity(p)).toEqual([]);
    const walls = Object.values(p.entities).filter((e) => e.type === 'wall');
    expect(walls.length).toBe(5);
    expect(walls.every((w) => w.type === 'wall' && w.height === 2800)).toBe(true);
  });
});

describe('transformações', () => {
  it('move, rotaciona, escala e espelha linha', () => {
    const l = line(0, 0, 10, 0);
    expect(moveEntity(l, v(5, 5)).a).toEqual(v(5, 5));
    const r = rotateEntity(l, v(0, 0), Math.PI / 2);
    close(r.b.x, 0);
    close(r.b.y, 10);
    expect(scaleEntity(l, v(0, 0), 2).b).toEqual(v(20, 0));
    const m = mirrorEntity(l, v(0, 0), v(0, 1));
    close(m.b.x, -10);
  });
  it('espelhar arco preserva a geometria refletida', () => {
    const arc: ArcEntity = { ...base, id: id(), type: 'arc', c: v(0, 0), r: 10, start: 0, end: Math.PI / 2 };
    const m = mirrorEntity(arc, v(0, 0), v(0, 1)); // espelho no eixo Y
    // arco original no 1º quadrante → espelhado no 2º quadrante (π/2 a π)
    close(m.start, Math.PI / 2);
    close(m.end, Math.PI);
  });
  it('escala recusa fator inválido', () => {
    expect(() => scaleEntity(line(0, 0, 1, 0), v(0, 0), 0)).toThrow();
  });
});

describe('offset', () => {
  it('linha para o lado indicado', () => {
    const o = offsetEntity(line(0, 0, 10, 0), 2, v(5, 5), 'x') as LineEntity;
    expect(o.a).toEqual(v(0, 2));
    const o2 = offsetEntity(line(0, 0, 10, 0), 2, v(5, -5), 'y') as LineEntity;
    expect(o2.a).toEqual(v(0, -2));
  });
  it('polilinha fechada com quinas em meia-esquadria', () => {
    const sq: Entity = { ...base, id: id(), type: 'polyline', closed: true, points: [v(0, 0), v(10, 0), v(10, 10), v(0, 10)] };
    const o = offsetEntity(sq, 1, v(5, 5), 'z');
    expect(o?.type).toBe('polyline');
    if (o?.type === 'polyline') {
      const m = measureEntity(o);
      close(m.area!, 64); // 8 × 8
    }
  });
  it('círculo interno degenerado retorna null', () => {
    expect(offsetEntity({ ...base, id: id(), type: 'circle', c: v(0, 0), r: 1 }, 2, v(0, 0), 'q')).toBeNull();
  });
});

describe('trim e extend', () => {
  it('apara o trecho central de uma linha cruzada por duas', () => {
    const t = line(0, 0, 10, 0);
    const cutters = [line(3, -1, 3, 1), line(7, -1, 7, 1)];
    const r = trimEntity(t, cutters, v(5, 0), id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.replace).toHaveLength(2);
      const lens = r.replace.map((e) => measureEntity(e).length!).sort();
      close(lens[0], 3);
      close(lens[1], 3);
    }
  });
  it('apara a ponta de uma linha', () => {
    const t = line(0, 0, 10, 0);
    const r = trimEntity(t, [line(3, -1, 3, 1)], v(1, 0), id);
    expect(r.ok && r.replace.length === 1 && (r.replace[0] as LineEntity).a.x).toBe(3);
  });
  it('apara círculo entre duas interseções vira arco', () => {
    const c: Entity = { ...base, id: id(), type: 'circle', c: v(0, 0), r: 5 };
    const r = trimEntity(c, [line(-10, 0, 10, 0)], v(0, 5), id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = r.replace[0] as ArcEntity;
      expect(a.type).toBe('arc');
      close(a.start, Math.PI);
      close(a.end, 0);
    }
  });
  it('sem interseção informa motivo', () => {
    const r = trimEntity(line(0, 0, 1, 0), [line(5, 5, 6, 6)], v(0.5, 0), id);
    expect(r.ok).toBe(false);
  });
  it('estende linha até a fronteira', () => {
    const r = extendEntity(line(0, 0, 5, 0), [line(8, -1, 8, 1)], v(4, 0));
    expect(r.ok && (r.replace[0] as LineEntity).b.x).toBe(8);
  });
});

describe('medições e geometria', () => {
  it('área de polilinha e parede', () => {
    const pl: Entity = { ...base, id: id(), type: 'polyline', closed: true, points: [v(0, 0), v(10000, 0), v(10000, 8000), v(0, 8000)] };
    expect(measureEntity(pl).area).toBe(80_000_000);
    expect(measureEntity(pl).perimeter).toBe(36000);
    const w: Entity = { ...base, id: id(), type: 'wall', a: v(0, 0), b: v(5000, 0), thickness: 150, height: 2800 };
    expect(measureEntity(w).length).toBe(5000);
    const o = wallOutline(w);
    expect(dist(o[0], o[3])).toBeCloseTo(150);
  });
  it('bbox de arco inclui quadrantes', () => {
    const b = entityBBox({ ...base, id: id(), type: 'arc', c: v(0, 0), r: 10, start: 0, end: Math.PI });
    expect(b.maxY).toBeCloseTo(10);
    expect(b.minX).toBeCloseTo(-10);
    expect(b.minY).toBeCloseTo(0);
  });
  it('seleção por distância e dentro da parede', () => {
    const w: Entity = { ...base, id: id(), type: 'wall', a: v(0, 0), b: v(5000, 0), thickness: 150, height: 2800 };
    expect(entityDistance(w, v(2500, 10))).toBe(0);
    expect(entityDistance(line(0, 0, 10, 0), v(5, 3))).toBe(3);
  });
  it('explode polilinha em linhas', () => {
    const pl: Entity = { ...base, id: id(), type: 'polyline', closed: true, points: [v(0, 0), v(1, 0), v(1, 1)] };
    expect(explodeEntity(pl, id)).toHaveLength(3);
    expect(explodeEntity(line(0, 0, 1, 1), id)).toBeNull();
  });
});

describe('snap', () => {
  const s = defaultSnapSettings(500);
  it('prioriza extremidade sobre ponto médio', () => {
    const r = findSnap({ cursor: v(0.4, 0), tolerance: 1, entities: [line(0, 0, 1, 0)], settings: s });
    expect(r?.kind).toBe('endpoint');
  });
  it('encontra interseção', () => {
    const r = findSnap({ cursor: v(5.2, 4.9), tolerance: 1, entities: [line(0, 0, 10, 10), line(0, 10, 10, 0)], settings: s });
    expect(r?.kind).toBe('intersection');
    close(r!.p.x, 5);
  });
  it('perpendicular a partir da base', () => {
    const r = findSnap({ cursor: v(3, 0.2), tolerance: 1, entities: [line(-100, 0, 100, 0)], base: v(3, 10), settings: s });
    expect(r?.kind).toBe('perpendicular');
    expect(r?.p).toEqual(v(3, 0));
  });
  it('tangente a círculo', () => {
    const c: Entity = { ...base, id: id(), type: 'circle', c: v(0, 0), r: 5 };
    const r = findSnap({ cursor: v(2.5, 4.3), tolerance: 1, entities: [c], base: v(10, 0), settings: { ...s, quadrant: false } });
    expect(r?.kind).toBe('tangent');
    close(dist(r!.p, v(0, 0)), 5);
  });
  it('grade como último recurso', () => {
    const r = findSnap({ cursor: v(740, 260), tolerance: 1, entities: [], settings: { ...s, grid: true } });
    expect(r).toEqual({ kind: 'grid', p: v(500, 500) });
  });
  it('ortogonal', () => {
    expect(applyOrtho(v(0, 0), v(10, 3))).toEqual(v(10, 0));
    expect(applyOrtho(v(0, 0), v(2, 9))).toEqual(v(0, 9));
  });
});

describe('índice espacial', () => {
  it('insere, consulta e remove', () => {
    const idx = new SpatialIndex(10);
    idx.insert('a', { minX: 0, minY: 0, maxX: 5, maxY: 5 });
    idx.insert('b', { minX: 100, minY: 100, maxX: 105, maxY: 105 });
    idx.insert('huge', { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 });
    expect(idx.query({ minX: -1, minY: -1, maxX: 6, maxY: 6 }).sort()).toEqual(['a', 'huge']);
    idx.remove('a');
    expect(idx.query({ minX: -1, minY: -1, maxX: 6, maxY: 6 })).toEqual(['huge']);
    expect(idx.size).toBe(2);
  });
});

describe('histórico', () => {
  it('desfaz e refaz criação, edição e remoção', () => {
    let p = createProject({ name: 'H' });
    const h = new History();
    const l = { ...line(0, 0, 1, 0), layerId: p.layers[0].id, levelId: p.levels[0].id };
    const tx1 = { label: 'Linha', changes: [addEntity(l)], at: 0 };
    p = applyChanges(p, tx1.changes);
    h.record(tx1);
    const moved = moveEntity(l, v(1, 1));
    const tx2 = { label: 'Mover', changes: [updateEntity(l, moved)], at: 0 };
    p = applyChanges(p, tx2.changes);
    h.record(tx2);
    expect(p.entities[l.id]).toEqual(moved);
    p = h.undo(p)!.project;
    expect(p.entities[l.id]).toEqual(l);
    p = h.undo(p)!.project;
    expect(p.entities[l.id]).toBeUndefined();
    expect(h.canUndo).toBe(false);
    p = h.redo(p)!.project;
    p = h.redo(p)!.project;
    expect(p.entities[l.id]).toEqual(moved);
    const tx3 = { label: 'Apagar', changes: [removeEntity(moved)], at: 0 };
    p = applyChanges(p, tx3.changes);
    h.record(tx3);
    expect(h.canRedo).toBe(false);
    p = h.undo(p)!.project;
    expect(p.entities[l.id]).toEqual(moved);
  });
  it('não muta o projeto original', () => {
    const p = createProject({ name: 'I' });
    const l = { ...line(0, 0, 1, 0), layerId: p.layers[0].id, levelId: p.levels[0].id };
    const p2 = applyChanges(p, [addEntity(l)]);
    expect(Object.keys(p.entities)).toHaveLength(0);
    expect(Object.keys(p2.entities)).toHaveLength(1);
  });
});
