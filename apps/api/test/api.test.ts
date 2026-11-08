import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { SqliteRepository } from '../src/db.js';
import type { Project } from '@traco/core';

let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  app = buildApp({ repo: new SqliteRepository(':memory:'), auth: { mode: 'none' } });
});
afterEach(async () => {
  await app.close();
});

const create = async (body: object) => app.inject({ method: 'POST', url: '/v1/projects', payload: body });

describe('API de projetos', () => {
  it('cria, salva, fecha e reabre (critério da Fase 1)', async () => {
    const r = await create({ name: 'Residência Silva', siteWidth: 12, siteDepth: 25, units: 'm', levelCount: 2 });
    expect(r.statusCode).toBe(201);
    const p = r.json().project as Project;
    expect(p.revision).toBe(1);
    expect(p.site.width).toBe(12000);

    const lid = p.layers[0].id;
    const vid = p.levels[0].id;
    const edited: Project = {
      ...p,
      entities: { e1: { id: 'e1', type: 'wall', layerId: lid, levelId: vid, a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, thickness: 150, height: 2800 } },
    };
    const s = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: edited, label: 'Parede' } });
    expect(s.statusCode).toBe(200);
    expect(s.json().project.revision).toBe(2);

    const g = await app.inject({ method: 'GET', url: `/v1/projects/${p.id}` });
    expect(g.json().project.entities.e1.thickness).toBe(150);

    const list = (await app.inject({ method: 'GET', url: '/v1/projects' })).json().projects;
    expect(list).toHaveLength(1);
    expect(list[0].entityCount).toBe(1);

    const revs = (await app.inject({ method: 'GET', url: `/v1/projects/${p.id}/revisions` })).json().revisions;
    expect(revs.map((x: { revision: number }) => x.revision)).toEqual([2, 1]);
  });

  it('recusa salvar sobre revisão desatualizada (409) sem perder dados', async () => {
    const p = (await create({ name: 'A' })).json().project as Project;
    await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: { ...p, meta: { ...p.meta, name: 'B' } } } });
    const stale = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: { ...p, meta: { ...p.meta, name: 'C' } } } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().currentRevision).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/v1/projects/${p.id}` })).json().project.meta.name).toBe('B');
  });

  it('valida entrada e integridade referencial', async () => {
    expect((await create({ name: '' })).statusCode).toBe(400);
    const p = (await create({ name: 'X' })).json().project as Project;
    const bad = { ...p, entities: { e: { id: 'e', type: 'line', layerId: 'nao-existe', levelId: p.levels[0].id, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } } };
    const r = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: bad } });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain('layer inexistente');
    const neg = { ...p, entities: { e: { id: 'e', type: 'circle', layerId: p.layers[0].id, levelId: p.levels[0].id, c: { x: 0, y: 0 }, r: -1 } } };
    expect((await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: neg } })).statusCode).toBe(400);
  });

  it('restaura revisão como nova revisão e exclui de forma reversível', async () => {
    const p = (await create({ name: 'Original' })).json().project as Project;
    await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: { ...p, meta: { ...p.meta, name: 'Mudado' } } } });
    const r = await app.inject({ method: 'POST', url: `/v1/projects/${p.id}/revisions/1/restore` });
    expect(r.json().project.meta.name).toBe('Original');
    expect(r.json().project.revision).toBe(3);
    expect((await app.inject({ method: 'DELETE', url: `/v1/projects/${p.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/v1/projects/${p.id}` })).statusCode).toBe(404);
  });

  it('cria projeto demonstrativo marcado', async () => {
    const p = (await create({ demo: true })).json().project as Project;
    expect(p.meta.isDemo).toBe(true);
    expect(Object.keys(p.entities).length).toBeGreaterThan(5);
  });

  it('salva e reabre elementos BIM (schema v2) e recusa vãos malformados', async () => {
    const p = (await create({ demo: true })).json().project as Project;
    expect(p.schemaVersion).toBe(2);
    const s = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: p } });
    expect(s.statusCode).toBe(200);
    const back = (await app.inject({ method: 'GET', url: `/v1/projects/${p.id}` })).json().project as Project;
    const types = Object.values(back.entities).map((e) => e.type);
    expect(types).toContain('slab');
    expect(types).toContain('roof');
    const wall = Object.values(back.entities).find((e) => e.type === 'wall' && e.openings?.length);
    expect(wall).toBeTruthy();
    // vão com lado inválido é rejeitado pela validação
    const broken = structuredClone(back);
    const w = Object.values(broken.entities).find((e) => e.type === 'wall' && e.openings?.length)!;
    if (w.type === 'wall') (w.openings![0] as { side: number }).side = 3;
    const r = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: back.revision, project: broken } });
    expect(r.statusCode).toBe(400);
  });

  it('aceita projeto salvo no schema v1', async () => {
    const p = (await create({ name: 'Antigo' })).json().project as Project;
    const r = await app.inject({ method: 'PATCH', url: `/v1/projects/${p.id}`, payload: { baseRevision: 1, project: { ...p, schemaVersion: 1 } } });
    expect(r.statusCode).toBe(200);
  });
});

describe('autenticação (modo token)', () => {
  const tokenApp = () =>
    buildApp({
      repo: new SqliteRepository(':memory:'),
      auth: { mode: 'token', verify: async (t) => (t === 'valido' ? 'user-1' : null) },
    });

  it('exige token nas rotas de projeto', async () => {
    const a = tokenApp();
    const r = await a.inject({ method: 'GET', url: '/v1/projects' });
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe('unauthorized');
    await a.close();
  });

  it('recusa token inválido e aceita válido', async () => {
    const a = tokenApp();
    const bad = await a.inject({ method: 'GET', url: '/v1/projects', headers: { authorization: 'Bearer falso' } });
    expect(bad.statusCode).toBe(401);
    const ok = await a.inject({ method: 'GET', url: '/v1/projects', headers: { authorization: 'Bearer valido' } });
    expect(ok.statusCode).toBe(200);
    await a.close();
  });

  it('health continua público e informa o modo', async () => {
    const a = tokenApp();
    const r = await a.inject({ method: 'GET', url: '/v1/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json().auth).toBe('required');
    await a.close();
  });
});
