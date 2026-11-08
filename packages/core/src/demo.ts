import { createProject, layerByName, newId } from './model/project.js';
import type { Entity, EntityDraft, Opening, Project } from './model/types.js';
import type { Vec2 } from './geometry/vec.js';

/**
 * Projeto DEMONSTRATIVO (dados fictícios, marcado com meta.isDemo).
 * Base do Teste de Aceitação A: terreno 12 × 25 m, edificação 10 × 8 m,
 * paredes de 15 cm com 2,80 m de altura, duas portas, quatro janelas,
 * piso e cobertura de duas águas (elementos BIM da Fase 3).
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
  const door = (offset: number, width: number, side: 1 | -1): Opening => ({ id: newId('op'), kind: 'door', offset, width, height: 2100, sill: 0, hinge: 'start', side });
  const win = (offset: number, width: number): Opening => ({ id: newId('op'), kind: 'window', offset, width, height: 1200, sill: 1000, hinge: 'start', side: 1 });
  // fachada frontal (y0): porta de entrada da sala + janela da sala + janela do quarto
  // fachada dos fundos (de x0+W para x0): janela do quarto + janela da sala
  const openings: Opening[][] = [[door(2000, 900, 1), win(4500, 1500), win(8000, 1200)], [], [win(2000, 1200), win(7000, 1500)], []];
  for (let i = 0; i < 4; i++) {
    add({ type: 'wall', layerId: L('ARQ-PAREDES'), a: corners[i], b: corners[(i + 1) % 4], thickness: t, height: h, openings: openings[i] });
  }
  // parede interna dividindo a sala do quarto, com porta
  add({ type: 'wall', layerId: L('ARQ-PAREDES'), a: pt(x0 + 6000, y0), b: pt(x0 + 6000, y0 + D), thickness: 120, height: h, openings: [door(4000, 800, -1)] });

  // piso pela face externa das paredes
  const o = t / 2;
  const outer = [pt(x0 - o, y0 - o), pt(x0 + W + o, y0 - o), pt(x0 + W + o, y0 + D + o), pt(x0 - o, y0 + D + o)];
  add({ type: 'slab', layerId: L('ARQ-PISOS'), points: outer, thickness: 100, offset: 0 });
  // cobertura de duas águas, cumeeira paralela à fachada frontal, 30%, beiral de 60 cm
  add({ type: 'roof', layerId: L('ARQ-COBERTURA'), points: outer, pitch: 30, overhang: 600, baseOffset: h, thickness: 100 });

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
