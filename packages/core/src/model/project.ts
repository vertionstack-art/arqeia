import type { LengthUnit } from '../units.js';
import { toMM } from '../units.js';
import { SCHEMA_VERSION, type Id, type Layer, type Level, type Project, type ProjectType } from './types.js';

export const newId = (prefix = ''): Id => {
  // Web Crypto existe no navegador e no Node 19+; o fallback cobre ambientes antigos
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rnd = c?.randomUUID ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
};

export interface NewProjectInput {
  name: string;
  code?: string;
  client?: string;
  responsible?: string;
  location?: string;
  projectType?: ProjectType;
  units?: LengthUnit;
  scale?: number;
  /** Dimensões do terreno nas unidades do projeto. */
  siteWidth?: number;
  siteDepth?: number;
  levelCount?: number;
  northAngleDeg?: number;
  timezone?: string;
}

export const DEFAULT_LAYERS: Omit<Layer, 'id'>[] = [
  { name: '0', color: '#e6edf7', lineWeight: 0.25, visible: true, locked: false },
  { name: 'ARQ-PAREDES', color: '#00a4ff', lineWeight: 0.5, visible: true, locked: false },
  { name: 'ARQ-ESQUADRIAS', color: '#00e7ff', lineWeight: 0.25, visible: true, locked: false },
  { name: 'ARQ-COTAS', color: '#ffb547', lineWeight: 0.18, visible: true, locked: false },
  { name: 'ARQ-TEXTOS', color: '#c9d3e6', lineWeight: 0.18, visible: true, locked: false },
  { name: 'ARQ-TERRENO', color: '#7cd992', lineWeight: 0.35, visible: true, locked: false },
  { name: 'ARQ-PISOS', color: '#8a9bb8', lineWeight: 0.18, visible: true, locked: false },
  { name: 'ARQ-COBERTURA', color: '#ff7a59', lineWeight: 0.25, visible: true, locked: false },
];

export const createProject = (input: NewProjectInput): Project => {
  const units = input.units ?? 'm';
  const now = new Date().toISOString();
  const levelCount = Math.max(1, Math.min(200, Math.floor(input.levelCount ?? 1)));
  const levels: Level[] = Array.from({ length: levelCount }, (_, i) => ({
    id: newId('lvl'),
    name: i === 0 ? 'Térreo' : `Pavimento ${i}`,
    elevation: i * 3000,
    height: 2800,
  }));
  const layers: Layer[] = DEFAULT_LAYERS.map((l) => ({ ...l, id: newId('lay') }));
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    meta: {
      name: input.name.trim(),
      code: input.code?.trim() ?? '',
      client: input.client?.trim() ?? '',
      responsible: input.responsible?.trim() ?? '',
      location: input.location?.trim() ?? '',
      projectType: input.projectType ?? 'residencial',
    },
    settings: {
      units,
      scale: input.scale ?? 50,
      gridSize: units === 'in' || units === 'ft' ? 304.8 : 500,
      northAngleDeg: input.northAngleDeg ?? 0,
      coordinateSystem: 'local',
      timezone: input.timezone ?? 'America/Sao_Paulo',
    },
    site: {
      width: toMM(input.siteWidth ?? 0, units),
      depth: toMM(input.siteDepth ?? 0, units),
    },
    levels,
    layers,
    entities: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
};

export const layerByName = (p: Project, name: string): Layer | undefined => p.layers.find((l) => l.name === name);

/** Validação estrutural mínima (o backend usa schema Zod completo). */
export const assertProjectIntegrity = (p: Project): string[] => {
  const errors: string[] = [];
  const layerIds = new Set(p.layers.map((l) => l.id));
  const levelIds = new Set(p.levels.map((l) => l.id));
  if (p.levels.length === 0) errors.push('Projeto sem pavimentos.');
  if (p.layers.length === 0) errors.push('Projeto sem layers.');
  for (const e of Object.values(p.entities)) {
    if (!layerIds.has(e.layerId)) errors.push(`Entidade ${e.id} referencia layer inexistente.`);
    if (!levelIds.has(e.levelId)) errors.push(`Entidade ${e.id} referencia pavimento inexistente.`);
  }
  return errors;
};
