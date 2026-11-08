import { z } from 'zod';
import { PROJECT_TYPES } from '@traco/core';

const finite = z.number().finite();
const vec = z.object({ x: finite, y: finite });
const id = z.string().min(1).max(128);
const base = { id, layerId: id, levelId: id };
const positive = finite.positive();

const openingSchema = z.object({
  id,
  kind: z.enum(['door', 'window']),
  offset: finite,
  width: positive,
  height: positive,
  sill: finite.min(0),
  hinge: z.enum(['start', 'end']),
  side: z.union([z.literal(1), z.literal(-1)]),
});

export const entitySchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('line'), a: vec, b: vec }),
  z.object({ ...base, type: z.literal('polyline'), points: z.array(vec).min(2).max(100_000), closed: z.boolean() }),
  z.object({ ...base, type: z.literal('circle'), c: vec, r: positive }),
  z.object({ ...base, type: z.literal('arc'), c: vec, r: positive, start: finite, end: finite }),
  z.object({ ...base, type: z.literal('text'), p: vec, text: z.string().max(10_000), height: positive, rotation: finite }),
  z.object({ ...base, type: z.literal('dimension'), a: vec, b: vec, offset: finite }),
  z.object({
    ...base,
    type: z.literal('wall'),
    a: vec,
    b: vec,
    thickness: positive,
    height: positive,
    baseOffset: finite.optional(),
    openings: z.array(openingSchema).max(500).optional(),
  }),
  z.object({ ...base, type: z.literal('slab'), points: z.array(vec).min(3).max(10_000), thickness: positive, offset: finite }),
  z.object({
    ...base,
    type: z.literal('roof'),
    points: z.array(vec).length(4),
    pitch: finite.min(0).max(400),
    overhang: finite.min(0).max(10_000),
    baseOffset: finite,
    thickness: positive,
  }),
]);

export const projectSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    id,
    meta: z.object({
      name: z.string().trim().min(1).max(200),
      code: z.string().max(64),
      client: z.string().max(200),
      responsible: z.string().max(200),
      location: z.string().max(500),
      projectType: z.enum(PROJECT_TYPES),
      isDemo: z.boolean().optional(),
    }),
    settings: z.object({
      units: z.enum(['mm', 'cm', 'm', 'in', 'ft']),
      scale: positive,
      gridSize: positive,
      northAngleDeg: finite.min(-360).max(360),
      coordinateSystem: z.literal('local'),
      timezone: z.string().max(64),
    }),
    site: z.object({ width: finite.min(0), depth: finite.min(0) }),
    levels: z.array(z.object({ id, name: z.string().min(1).max(100), elevation: finite, height: positive })).min(1).max(200),
    layers: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          lineWeight: finite.min(0).max(5),
          visible: z.boolean(),
          locked: z.boolean(),
        }),
      )
      .min(1)
      .max(1000),
    entities: z.record(z.string(), entitySchema),
    revision: z.number().int().min(0),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((p, ctx) => {
    const layers = new Set(p.layers.map((l) => l.id));
    const levels = new Set(p.levels.map((l) => l.id));
    for (const [key, e] of Object.entries(p.entities)) {
      if (key !== e.id) ctx.addIssue({ code: 'custom', message: `Chave ${key} difere do id da entidade.` });
      if (!layers.has(e.layerId)) ctx.addIssue({ code: 'custom', message: `Entidade ${e.id}: layer inexistente.` });
      if (!levels.has(e.levelId)) ctx.addIssue({ code: 'custom', message: `Entidade ${e.id}: pavimento inexistente.` });
    }
  });

export const createProjectBody = z.union([
  z.object({ demo: z.literal(true) }),
  z.object({
    name: z.string().trim().min(1, 'Informe o nome do projeto.').max(200),
    code: z.string().max(64).optional(),
    client: z.string().max(200).optional(),
    responsible: z.string().max(200).optional(),
    location: z.string().max(500).optional(),
    projectType: z.enum(PROJECT_TYPES).optional(),
    units: z.enum(['mm', 'cm', 'm', 'in', 'ft']).optional(),
    scale: positive.max(100_000).optional(),
    siteWidth: finite.min(0).max(1e7).optional(),
    siteDepth: finite.min(0).max(1e7).optional(),
    levelCount: z.number().int().min(1).max(200).optional(),
    northAngleDeg: finite.min(-360).max(360).optional(),
    timezone: z.string().max(64).optional(),
  }),
]);

export const saveProjectBody = z.object({
  baseRevision: z.number().int().min(0),
  label: z.string().max(200).optional(),
  project: projectSchema,
});
