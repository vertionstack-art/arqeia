import { describe, expect, it } from 'vitest';
import {
  type Opening,
  type Project,
  type RoofEntity,
  type SlabEntity,
  type Vec2,
  type WallEntity,
  buildModelMesh,
  createDemoProject,
  createProject,
  migrateProject,
  mirrorEntity,
  moveEntity,
  openingFits,
  openingIssues,
  openingSymbol,
  placeOpening,
  polygonArea,
  roofGeometry,
  scaleEntity,
  triangulate,
  wallGeometry,
  wallQuantities,
} from '../src/index.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<WallEntity> = {}): WallEntity => ({
  id,
  type: 'wall',
  layerId: 'L',
  levelId: 'N',
  a,
  b,
  thickness: 200,
  height: 2800,
  ...extra,
});
const op = (kind: Opening['kind'], offset: number, width: number, extra: Partial<Opening> = {}): Opening => ({
  id: `${kind}${offset}`,
  kind,
  offset,
  width,
  height: kind === 'door' ? 2100 : 1000,
  sill: kind === 'door' ? 0 : 1000,
  hinge: 'start',
  side: 1,
  ...extra,
});

/** Volume de uma malha fechada pelo teorema da divergência (mm³). */
const meshVolume = (positions: number[]): number => {
  let vol = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
};

const projectWith = (ents: (WallEntity | SlabEntity | RoofEntity)[]): Project => {
  const p = createProject({ name: 'T' });
  for (const e of ents) p.entities[e.id] = { ...e, layerId: p.layers[0].id, levelId: p.levels[0].id };
  return p;
};

describe('junções de paredes', () => {
  it('canto em L: face externa estende e interna recua meia espessura', () => {
    const g = wallGeometry([wall('a', v(0, 0), v(4000, 0)), wall('b', v(0, 0), v(0, 3000))]);
    const ga = g.get('a')!;
    // parede a: esquerda (y+) é a face interna do L; direita (y−) a externa
    expect(ga.ls).toBeCloseTo(100);
    expect(ga.rs).toBeCloseTo(-100);
    expect(ga.outline[0]).toEqual({ x: 100, y: 100 });
    expect(ga.outline[3]).toEqual({ x: -100, y: -100 });
  });

  it('T: a parede que chega termina na face da hospedeira, que continua inteira', () => {
    const host = wall('h', v(0, 0), v(6000, 0), { thickness: 150 });
    const g = wallGeometry([host, wall('t', v(3000, 0), v(3000, 4000), { thickness: 120 })]);
    expect(g.get('t')!.ls).toBeCloseTo(75);
    expect(g.get('t')!.rs).toBeCloseTo(75);
    expect(g.get('h')!.ls).toBe(0);
    expect(g.get('h')!.le).toBeCloseTo(6000);
  });

  it('retângulo fechado: os quatro cantos fecham sem sobra nem buraco', () => {
    const c = [v(0, 0), v(5000, 0), v(5000, 4000), v(0, 4000)];
    const walls = c.map((p, i) => wall(`w${i}`, p, c[(i + 1) % 4]));
    const g = wallGeometry(walls);
    // canto externo de w0 no fim coincide com o canto externo de w1 no início
    const w0 = g.get('w0')!;
    const w1 = g.get('w1')!;
    expect(w0.outline[2].x).toBeCloseTo(w1.outline[3].x);
    expect(w0.outline[2].y).toBeCloseTo(w1.outline[3].y);
    expect(w0.outline[2]).toEqual({ x: 5100, y: -100 });
  });

  it('continuação colinear não recorta', () => {
    const g = wallGeometry([wall('a', v(0, 0), v(3000, 0)), wall('b', v(3000, 0), v(6000, 0))]);
    expect(g.get('a')!.le).toBeCloseTo(3000);
    expect(g.get('a')!.re).toBeCloseTo(3000);
  });
});

describe('aberturas', () => {
  it('divide a parede em trechos e marca vãos inválidos', () => {
    const w = wall('w', v(0, 0), v(5000, 0), {
      openings: [op('door', 1000, 800), op('window', 3000, 1200), op('window', 3300, 1000), op('window', 4800, 1000)],
    });
    const g = wallGeometry([w]).get('w')!;
    expect(g.pieces).toEqual([
      { s0: 0, s1: 600 },
      { s0: 1400, s1: 2400 },
      { s0: 3600, s1: 5000 },
    ]);
    const issues = openingIssues(w).map((i) => i.message);
    expect(issues).toContain('Janela sobrepõe outra abertura');
    expect(issues).toContain('Janela sai do comprimento da parede');
  });

  it('janela mais alta que a parede é rejeitada', () => {
    const w = wall('w', v(0, 0), v(4000, 0), { height: 2000, openings: [op('window', 2000, 1000, { sill: 1200, height: 1000 })] });
    expect(openingIssues(w)[0].message).toBe('Janela ultrapassa a altura da parede');
  });

  it('posiciona e verifica espaço livre', () => {
    const w = wall('w', v(0, 0), v(3000, 0), { openings: [op('door', 1000, 800)] });
    expect(placeOpening(w, v(100, 500), 800)).toBe(400);
    expect(placeOpening(w, v(2900, 0), 800)).toBe(2600);
    expect(placeOpening(w, v(0, 0), 4000)).toBeNull();
    expect(openingFits(w, 1500, 800)).toBe(false);
    expect(openingFits(w, 2200, 800)).toBe(true);
  });

  it('mover a parede leva a abertura junto (critério da Fase 3)', () => {
    const w = wall('w', v(0, 0), v(4000, 0), { openings: [op('door', 1000, 800)] });
    const before = openingSymbol(wallGeometry([w]).get('w')!, wallGeometry([w]).get('w')!.openings[0]);
    const moved = moveEntity(w, v(500, 2000));
    const g = wallGeometry([moved]).get('w')!;
    const after = openingSymbol(g, g.openings[0]);
    expect(after.lines[0][0].x - before.lines[0][0].x).toBeCloseTo(500);
    expect(after.lines[0][0].y - before.lines[0][0].y).toBeCloseTo(2000);
  });

  it('espelhar inverte o lado de abertura; escalar reposiciona sem mudar a largura', () => {
    const w = wall('w', v(0, 0), v(4000, 0), { openings: [op('door', 1000, 800)] });
    expect(mirrorEntity(w, v(0, 0), v(1, 0)).openings![0].side).toBe(-1);
    const s = scaleEntity(w, v(0, 0), 2);
    expect(s.openings![0].offset).toBe(2000);
    expect(s.openings![0].width).toBe(800);
  });

  it('quantitativos descontam os vãos', () => {
    const q = wallQuantities(wall('w', v(0, 0), v(4000, 0), { openings: [op('window', 2000, 1000)] }));
    expect(q.grossArea).toBe(4000 * 2800);
    expect(q.netArea).toBe(4000 * 2800 - 1000 * 1000);
    expect(q.windows).toBe(1);
  });
});

describe('malha 3D', () => {
  it('volume da parede = sólido menos o vão (malha fechada e orientada)', () => {
    const p = projectWith([wall('w', v(0, 0), v(4000, 0), { thickness: 150, openings: [op('window', 2000, 1000)] })]);
    const solid = buildModelMesh(p).parts.find((x) => x.kind === 'wall')!;
    expect(meshVolume(solid.positions)).toBeCloseTo(4000 * 150 * 2800 - 1000 * 1000 * 150, -3);
  });

  it('a malha acompanha a edição: alargar a janela reduz o volume', () => {
    const w = wall('w', v(0, 0), v(4000, 0), { thickness: 150, openings: [op('window', 2000, 1000)] });
    const vol = (x: WallEntity) => meshVolume(buildModelMesh(projectWith([x])).parts.find((pp) => pp.kind === 'wall')!.positions);
    const wider = { ...w, openings: [{ ...w.openings![0], width: 1500 }] };
    expect(vol(w) - vol(wider)).toBeCloseTo(500 * 1000 * 150, -3);
  });

  it('piso usa a cota do pavimento e a espessura', () => {
    const p = projectWith([{ id: 's', type: 'slab', layerId: '', levelId: '', points: [v(0, 0), v(2000, 0), v(2000, 1000), v(0, 1000)], thickness: 100, offset: 0 }]);
    p.levels[0].elevation = 3000;
    const part = buildModelMesh(p).parts[0];
    expect(meshVolume(part.positions)).toBeCloseTo(2000 * 1000 * 100, -2);
    const zs = part.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBe(3000);
    expect(Math.min(...zs)).toBe(2900);
  });

  it('cobertura de duas águas: cumeeira no meio do vão, altura pela inclinação', () => {
    const rg = roofGeometry({ points: [v(0, 0), v(10000, 0), v(10000, 8000), v(0, 8000)], pitch: 30, overhang: 600, baseOffset: 2800 })!;
    expect(rg.ridge[0]).toEqual({ x: -600, y: 4000 });
    expect(rg.ridge[1]).toEqual({ x: 10600, y: 4000 });
    expect(rg.ridgeZ).toBeCloseTo(2800 + 4000 * 0.3);
    expect(rg.eaveZ).toBeCloseTo(2800 - 600 * 0.3);
    expect(polygonArea(rg.outline)).toBeCloseTo(11200 * 9200);
  });

  it('projeto demonstrativo (Teste A) gera malha sem avisos', () => {
    const demo = createDemoProject();
    const walls = Object.values(demo.entities).filter((e): e is WallEntity => e.type === 'wall');
    expect(walls.flatMap((w) => w.openings ?? []).filter((o) => o.kind === 'door')).toHaveLength(2);
    expect(walls.flatMap((w) => w.openings ?? []).filter((o) => o.kind === 'window')).toHaveLength(4);
    const mesh = buildModelMesh(demo);
    expect(mesh.issues).toEqual([]);
    expect(mesh.parts.some((p) => p.kind === 'roof')).toBe(true);
    expect(mesh.parts.filter((p) => p.kind === 'glass')).toHaveLength(2); // 2 paredes com janelas
  });
});

describe('triangulação e migração', () => {
  it('polígono côncavo (L) triangulado cobre a área exata', () => {
    const L = [v(0, 0), v(4000, 0), v(4000, 1000), v(1000, 1000), v(1000, 3000), v(0, 3000)];
    const tris = triangulate(L);
    expect(tris).toHaveLength(4);
    const area = tris.reduce((s, [a, b, c]) => s + polygonArea([L[a], L[b], L[c]]), 0);
    expect(area).toBeCloseTo(polygonArea(L));
  });

  it('migra v1 para v2 sem perder dados', () => {
    const p = createProject({ name: 'Velho' });
    const v1 = { ...p, schemaVersion: 1 };
    const m = migrateProject(v1);
    expect(m.schemaVersion).toBe(2);
    expect(m.meta.name).toBe('Velho');
  });
});

describe('paredes unidas acompanham', () => {
  it('mover uma parede arrasta os cantos e os T conectados, mantendo as janelas no lugar', async () => {
    const { propagateWallJoins: prop, updateEntity } = await import('../src/index.ts');
    const c = [v(0, 0), v(6000, 0), v(6000, 4000), v(0, 4000)];
    const walls = c.map((p, i) => wall(`w${i}`, p, c[(i + 1) % 4]));
    walls[2].openings = [op('window', 3000, 1000)]; // parede de (6000,4000) a (0,4000): centro em x=3000
    const tWall = wall('t', v(3000, 0), v(3000, 4000));
    const p = projectWith([...walls, tWall]);
    const east = p.entities['w1'] as WallEntity;
    const moved = { ...east, a: v(7000, 0), b: v(7000, 4000) };
    const extra = prop(p, [updateEntity(east, moved)]);
    const byId = new Map(extra.map((x) => [x.id, x.after as WallEntity]));
    expect(byId.get('w0')!.b).toEqual(v(7000, 0));
    expect(byId.get('w2')!.a).toEqual(v(7000, 4000));
    // janela continua em x = 3000 no mundo
    const w2 = byId.get('w2')!;
    expect(w2.a.x - w2.openings![0].offset).toBeCloseTo(3000);
    expect(byId.has('w3')).toBe(false);
    expect(byId.has('t')).toBe(false); // o T estava em w0/w2, que não foram movidas pelo usuário
  });

  it('T acompanha o deslocamento paralelo da hospedeira', async () => {
    const { propagateWallJoins: prop, updateEntity } = await import('../src/index.ts');
    const host = wall('h', v(0, 0), v(6000, 0));
    const t = wall('t', v(3000, 0), v(3000, 3000));
    const p = projectWith([host, t]);
    const h = p.entities['h'] as WallEntity;
    const extra = prop(p, [updateEntity(h, { ...h, a: v(0, -500), b: v(6000, -500) })]);
    expect((extra[0].after as WallEntity).a).toEqual(v(3000, -500));
    expect((extra[0].after as WallEntity).b).toEqual(v(3000, 3000));
  });
});
