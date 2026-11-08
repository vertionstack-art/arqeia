import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createProject, createDemoProject } from '@traco/core';
import type { ProjectRepository, RequestContext } from './repository.js';
import { RepositoryError } from './supabase-repo.js';
import { createProjectBody, saveProjectBody } from './schema.js';

/**
 * Autenticação:
 *  - `none`: só para desenvolvimento local com SQLite (usuário único "local");
 *  - `token`: exige `Authorization: Bearer <jwt>` e valida com `verify`.
 */
export type AuthMode = { mode: 'none' } | { mode: 'token'; verify: (token: string) => Promise<string | null> };

export interface AppOptions {
  repo: ProjectRepository;
  auth: AuthMode;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

const zodMessage = (e: z.ZodError): string =>
  e.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message)
    .join('; ');

const bearer = (req: FastifyRequest): string | null => {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
};

/** Monta a API versionada (/v1). Exportada separadamente para testes com inject(). */
export const buildApp = (opts: AppOptions): FastifyInstance => {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 50 * 1024 * 1024 });
  const { repo, auth } = opts;
  app.addHook('onClose', async () => repo.close());
  app.decorateRequest('ctx', null as unknown as RequestContext);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'validation', message: zodMessage(err) });
    if (err instanceof RepositoryError) {
      if (err.statusCode >= 500) app.log.error(err);
      return reply.code(err.statusCode).send({ error: err.statusCode === 401 ? 'unauthorized' : 'error', message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const message = err instanceof Error ? err.message : 'Erro';
    return reply.code(status).send({ error: 'error', message: status >= 500 ? 'Erro interno do servidor.' : message });
  });

  // Toda rota de projeto exige identidade (exceto em modo local sem login).
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/v1/projects')) return;
    if (auth.mode === 'none') {
      req.ctx = { userId: 'local', token: null };
      return;
    }
    const token = bearer(req);
    if (!token) return reply.code(401).send({ error: 'unauthorized', message: 'Faça login para continuar.' });
    const userId = await auth.verify(token);
    if (!userId) return reply.code(401).send({ error: 'unauthorized', message: 'Sessão inválida ou expirada. Entre novamente.' });
    req.ctx = { userId, token };
  });

  app.get('/v1/health', async () => ({ ok: true, version: '0.2.0', storage: repo.kind, auth: auth.mode === 'none' ? 'none' : 'required' }));

  app.get('/v1/projects', async (req) => ({ projects: await repo.list(req.ctx) }));

  app.post('/v1/projects', async (req, reply) => {
    const body = createProjectBody.parse(req.body);
    const project = 'demo' in body ? createDemoProject() : createProject(body);
    return reply.code(201).send({ project: await repo.insert(req.ctx, project) });
  });

  app.get<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    const p = await repo.get(req.ctx, req.params.id);
    if (!p) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return { project: p };
  });

  app.patch<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    const body = saveProjectBody.parse(req.body);
    if (body.project.id !== req.params.id) return reply.code(400).send({ error: 'validation', message: 'ID do projeto não confere com a URL.' });
    const r = await repo.save(req.ctx, body.project, body.baseRevision, body.label ?? 'Alteração');
    if (r.ok) return { project: r.project };
    if (r.reason === 'not_found') return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return reply.code(409).send({
      error: 'conflict',
      message: `O projeto foi alterado em outro lugar (revisão atual ${r.current}, sua base ${body.baseRevision}). Nada foi sobrescrito.`,
      currentRevision: r.current,
    });
  });

  app.delete<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    if (!(await repo.softDelete(req.ctx, req.params.id))) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/v1/projects/:id/revisions', async (req, reply) => {
    if (!(await repo.get(req.ctx, req.params.id))) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return { revisions: await repo.revisions(req.ctx, req.params.id) };
  });

  app.get<{ Params: { id: string; rev: string } }>('/v1/projects/:id/revisions/:rev', async (req, reply) => {
    const p = await repo.revision(req.ctx, req.params.id, Number(req.params.rev));
    if (!p) return reply.code(404).send({ error: 'not_found', message: 'Revisão não encontrada.' });
    return { project: p };
  });

  /** Restaurar cria uma NOVA revisão com o conteúdo antigo; o histórico nunca é reescrito. */
  app.post<{ Params: { id: string; rev: string } }>('/v1/projects/:id/revisions/:rev/restore', async (req, reply) => {
    const current = await repo.get(req.ctx, req.params.id);
    const old = await repo.revision(req.ctx, req.params.id, Number(req.params.rev));
    if (!current || !old) return reply.code(404).send({ error: 'not_found', message: 'Revisão não encontrada.' });
    const r = await repo.save(req.ctx, { ...old, id: current.id }, current.revision, `Restaurada a revisão ${req.params.rev}`);
    if (!r.ok) return reply.code(409).send({ error: 'conflict', message: 'Conflito ao restaurar; recarregue o projeto.' });
    return { project: r.project };
  });

  return app;
};
