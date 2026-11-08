import type { Project } from '@traco/core';

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  client: string;
  projectType: string;
  isDemo: boolean;
  revision: number;
  entityCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionSummary {
  revision: number;
  label: string;
  entityCount: number;
  createdAt: string;
}

export type SaveResult =
  | { ok: true; project: Project }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'conflict'; current: number };

/** Identidade de quem faz a requisição. `token` é o JWT do usuário (Supabase). */
export interface RequestContext {
  userId: string;
  token: string | null;
}

/**
 * Contrato de persistência. Duas implementações:
 *  - SqliteRepository: desenvolvimento local, usuário único, sem login;
 *  - SupabaseRepository: produção, Postgres com RLS (cada usuário vê só o que é seu).
 */
export interface ProjectRepository {
  readonly kind: 'sqlite' | 'supabase';
  list(ctx: RequestContext): Promise<ProjectSummary[]>;
  get(ctx: RequestContext, id: string): Promise<Project | null>;
  insert(ctx: RequestContext, p: Project): Promise<Project>;
  save(ctx: RequestContext, p: Project, baseRevision: number, label: string): Promise<SaveResult>;
  softDelete(ctx: RequestContext, id: string): Promise<boolean>;
  revisions(ctx: RequestContext, id: string): Promise<RevisionSummary[]>;
  revision(ctx: RequestContext, id: string, revision: number): Promise<Project | null>;
  close(): Promise<void>;
}
