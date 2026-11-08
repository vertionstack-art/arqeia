import { createProject, layerByName, newId } from './model/project.ts';
import type { Entity, EntityDraft, Project } from './model/types.ts';
import type { Vec2 } from './geometry/vec.ts';

/**
 * Projeto DEMONSTRATIVO (dados fictícios, marcado com meta.isDemo).
 * Base do Teste de Aceitação A: terreno 12 × 25 m, edificação 10 × 8 m,
 * paredes de 15 cm com 2,80 m de altura. Portas, janelas e cobertura
 * entram quando os elementos BIM da Fase 3 existirem.
 */
export const createDemoProject = (): Project => {
  const p = createProject({
    name: 'Casa Exemplo (demonstração)',
    code: 'DEMO-001',
    client: 'Cliente fictício',
    responsible: '—',
    location: 'Lote fictício',
    projectType: 'residencial',
    units: 'm',
    siteWidth: 12,
    siteDepth: 25,
    levelCount: 1,
  });
  p.meta.isDemo = true;
  const lvl = p.levels[0].id;
  const L = (name: string) => layerByName(p, name)!.id;
  const add = (e: EntityDraft) => {
    const id = newId('ent');
    p.entities[id] = { ...e, id, levelId: lvl } as Entity;
  };

  // Terreno 12 × 25 m
  add({ type: 'polyline', layerId: L('ARQ-TERRENO'), points: [pt(0, 0), pt(12000, 0), pt(12000, 25000), pt(0, 25000)], closed: true });

  // Edificação 10 × 8 m, recuo de 1 m nas laterais e 5 m na frente; eixo das paredes
  const x0 = 1000;
  const y0 = 5000;
  const W = 10000;
  const D = 8000;
  const t = 150;
  const h = 2800;
  const corners = [pt(x0, y0), pt(x0 + W, y0), pt(x0 + W, y0 + D), pt(x0, y0 + D)];
  for (let i = 0; i < 4; i++) {
    add({ type: 'wall', layerId: L('ARQ-PAREDES'), a: corners[i], b: corners[(i + 1) % 4], thickness: t, height: h });
  }
  // parede interna dividindo a sala dos quartos
  add({ type: 'wall', layerId: L('ARQ-PAREDES'), a: pt(x0 + 6000, y0), b: pt(x0 + 6000, y0 + D), thickness: 120, height: h });

  // Cotas gerais
  add({ type: 'dimension', layerId: L('ARQ-COTAS'), a: pt(x0, y0), b: pt(x0 + W, y0), offset: -1200 });
  add({ type: 'dimension', layerId: L('ARQ-COTAS'), a: pt(x0 + W, y0), b: pt(x0 + W, y0 + D), offset: -1200 });
  add({ type: 'dimension', layerId: L('ARQ-COTAS'), a: pt(0, 0), b: pt(12000, 0), offset: -1800 });
  add({ type: 'dimension', layerId: L('ARQ-COTAS'), a: pt(0, 25000), b: pt(0, 0), offset: -1200 });

  add({ type: 'text', layerId: L('ARQ-TEXTOS'), p: pt(x0 + 1800, y0 + 3800), text: 'SALA', height: 300, rotation: 0 });
  add({ type: 'text', layerId: L('ARQ-TEXTOS'), p: pt(x0 + 7300, y0 + 3800), text: 'QUARTO', height: 300, rotation: 0 });
  add({ type: 'text', layerId: L('ARQ-TEXTOS'), p: pt(4200, 1800), text: 'ACESSO', height: 250, rotation: 0 });
  return p;
};

const pt = (x: number, y: number): Vec2 => ({ x, y });
