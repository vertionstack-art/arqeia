import type { Vec2 } from '../geometry/vec.js';
import type { LengthUnit } from '../units.js';

export const SCHEMA_VERSION = 1;

export type Id = string;

interface EntityBase {
  id: Id;
  layerId: Id;
  levelId: Id;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  a: Vec2;
  b: Vec2;
}

export interface PolylineEntity extends EntityBase {
  type: 'polyline';
  points: Vec2[];
  closed: boolean;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  c: Vec2;
  r: number;
}

/** Arco anti-horário de `start` a `end` (radianos). */
export interface ArcEntity extends EntityBase {
  type: 'arc';
  c: Vec2;
  r: number;
  start: number;
  end: number;
}

export interface TextEntity extends EntityBase {
  type: 'text';
  p: Vec2;
  text: string;
  /** Altura do texto em mm de modelo (como no CAD); a escala da prancha define o tamanho impresso. */
  height: number;
  rotation: number;
}

/** Cota alinhada: mede a distância real entre a e b; `offset` desloca a linha de cota (positivo = à esquerda de a→b). */
export interface DimensionEntity extends EntityBase {
  type: 'dimension';
  a: Vec2;
  b: Vec2;
  offset: number;
}

/**
 * Parede (representação 2D inicial). Eixo a→b, espessura centrada no eixo.
 * Na Fase 3 recebe camadas, aberturas e geometria 3D.
 */
export interface WallEntity extends EntityBase {
  type: 'wall';
  a: Vec2;
  b: Vec2;
  thickness: number;
  height: number;
}

export type Entity =
  | LineEntity
  | PolylineEntity
  | CircleEntity
  | ArcEntity
  | TextEntity
  | DimensionEntity
  | WallEntity;

export type EntityType = Entity['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Entidade ainda sem id/pavimento (usada pelas ferramentas antes de inserir no modelo). */
export type EntityDraft = DistributiveOmit<Entity, 'id' | 'levelId'>;

export interface Layer {
  id: Id;
  name: string;
  color: string;
  /** Espessura de pena em mm (impressão). */
  lineWeight: number;
  visible: boolean;
  locked: boolean;
}

export interface Level {
  id: Id;
  name: string;
  /** Cota do piso em mm. */
  elevation: number;
  /** Pé-direito em mm. */
  height: number;
}

export const PROJECT_TYPES = [
  'residencial',
  'comercial',
  'corporativo',
  'industrial',
  'institucional',
  'urbanistico',
  'reforma',
  'interiores',
  'paisagismo',
  'misto',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ProjectMeta {
  name: string;
  code: string;
  client: string;
  responsible: string;
  location: string;
  projectType: ProjectType;
  /** Demonstrativo: dados fictícios claramente identificados. */
  isDemo?: boolean;
}

export interface ProjectSettings {
  units: LengthUnit;
  /** Denominador da escala inicial (ex.: 50 para 1:50). */
  scale: number;
  gridSize: number;
  /** Ângulo do norte verdadeiro, em graus, medido a partir do eixo +Y no sentido horário. */
  northAngleDeg: number;
  /** Sistema de coordenadas: por enquanto apenas local cartesiano. */
  coordinateSystem: 'local';
  timezone: string;
}

export interface Site {
  width: number;
  depth: number;
}

export interface Project {
  schemaVersion: number;
  id: Id;
  meta: ProjectMeta;
  settings: ProjectSettings;
  site: Site;
  levels: Level[];
  layers: Layer[];
  entities: Record<Id, Entity>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
