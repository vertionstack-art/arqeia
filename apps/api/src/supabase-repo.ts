import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@traco/core';
import type { ProjectRepository, ProjectSummary, RequestContext, RevisionSummary, SaveResult } from './repository.js';

export interface SupabaseConfig {
  url: string;
  /** Chave publicável (sb_publishable_… ou anon). Nunca a service_role: o acesso é sempre como o usuário. */
  publishableKey: string;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
  }
}

/**
 * Repositório sobre Supabase. Cada requisição usa um cliente com o JWT do
 * próprio usuário, então o Postgres aplica RLS: não há como ler ou alterar
 * dados de outra pessoa, mesmo com bug na API.
 */
export class SupabaseRepository implements ProjectRepository {
  readonly kind = 'supabase' as const;

  constructor(private readonly cfg: SupabaseConfig) {}

  private client(ctx: RequestContext): SupabaseClient {
    if (!ctx.token) throw new RepositoryError('Não autenticado.', 401);
    return createClient(this.cfg.url, this.cfg.publishableKey, {
      global: { headers: { Authorization: `Bearer ${ctx.token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  private fail(error: { message: string; code?: string } | null): never {
    const msg = error?.message ?? 'Erro no banco de dados.';
    // 42501 = RLS/privilégio; PGRST301 = JWT inválido/expirado
    if (error?.code === 'PGRST301' || /jwt/i.test(msg)) throw new RepositoryError('Sessão expirada. Entre novamente.', 401);
    if (error?.code === '42501') throw new RepositoryError('Sem permissão para este projeto.', 403);
    if (error?.code === '23505') throw new RepositoryError('Já existe um projeto com este identificador.', 409);
    throw new RepositoryError(msg, 500);
  }

  async list(ctx: RequestContext): Promise<ProjectSummary[]> {
    const { data, error } = await this.client(ctx)
      .from('projects')
      .select('id, name, code, client, project_type, is_demo, revision, entity_count, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) this.fail(error);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      client: r.client,
      projectType: r.project_type,
      isDemo: r.is_demo,
      revision: r.revision,
      entityCount: r.entity_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async get(ctx: RequestContext, id: string): Promise<Project | null> {
    const { data, error } = await this.client(ctx).from('projects').select('data').eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) this.fail(error);
    return data ? (data.data as Project) : null;
  }

  async insert(ctx: RequestContext, p: Project): Promise<Project> {
    const now = new Date().toISOString();
    const stored: Project = { ...p, revision: 1, createdAt: now, updatedAt: now };
    const { data, error } = await this.client(ctx).rpc('create_project', { p_id: stored.id, p_data: stored });
    if (error) this.fail(error);
    if ((data as { status?: string })?.status !== 'ok') throw new RepositoryError('Falha ao criar o projeto.');
    return stored;
  }

  async save(ctx: RequestContext, p: Project, baseRevision: number, label: string): Promise<SaveResult> {
    const stored: Project = { ...p, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client(ctx).rpc('save_project', { p_id: p.id, p_base: baseRevision, p_data: stored, p_label: label });
    if (error) this.fail(error);
    const r = data as { status: string; revision?: number; current?: number };
    if (r.status === 'not_found') return { ok: false, reason: 'not_found' };
    if (r.status === 'conflict') return { ok: false, reason: 'conflict', current: Number(r.current) };
    return { ok: true, project: { ...stored, revision: Number(r.revision) } };
  }

  async softDelete(ctx: RequestContext, id: string): Promise<boolean> {
    const db = this.client(ctx);
    const { data, error } = await db.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id');
    if (error) this.fail(error);
    if (!data?.length) return false;
    await db.from('audit_log').insert({ project_id: id, action: 'project.delete', user_id: ctx.userId });
    return true;
  }

  async revisions(ctx: RequestContext, id: string): Promise<RevisionSummary[]> {
    const { data, error } = await this.client(ctx)
      .from('revisions')
      .select('revision, label, entity_count, created_at')
      .eq('project_id', id)
      .order('revision', { ascending: false });
    if (error) this.fail(error);
    return (data ?? []).map((r) => ({ revision: r.revision, label: r.label, entityCount: r.entity_count, createdAt: r.created_at }));
  }

  async revision(ctx: RequestContext, id: string, revision: number): Promise<Project | null> {
    const { data, error } = await this.client(ctx).from('revisions').select('data').eq('project_id', id).eq('revision', revision).maybeSingle();
    if (error) this.fail(error);
    return data ? (data.data as Project) : null;
  }

  async close(): Promise<void> {}
}

/** Verifica o JWT do usuário (assinatura e expiração) e devolve o id (claim `sub`). */
export const verifySupabaseToken = async (cfg: SupabaseConfig, token: string): Promise<string | null> => {
  const client = createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
};
