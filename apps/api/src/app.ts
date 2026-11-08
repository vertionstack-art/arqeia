import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createProject, createDemoProject } from '@traco/core';
import { ProjectRepository } from './db.ts';
import { createProjectBody, saveProjectBody } from './schema.ts';

export interface AppOptions {
  dbPath: string;
  logger?: boolean;
}

const zodMessage = (e: z.ZodError): string =>
  e.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message)
    .join('; ');

/** Monta a API versionada (/v1). Exportada separadamente para testes com inject(). */
export const buildApp = (opts: AppOptions): FastifyInstance & { repo: ProjectRepository } => {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 50 * 1024 * 1024 });
  const repo = new ProjectRepository(opts.dbPath);
  app.addHook('onClose', async () => repo.close());

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'validation', message: zodMessage(err) });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const message = err instanceof Error ? err.message : 'Erro';
    return reply.code(status).send({ error: 'error', message: status >= 500 ? 'Erro interno do servidor.' : message });
  });

  app.get('/v1/health', async () => ({ ok: true, version: '0.1.0', storage: 'sqlite' }));

  app.get('/v1/projects', async () => ({ projects: repo.list() }));

  app.post('/v1/projects', async (req, reply) => {
    const body = createProjectBody.parse(req.body);
    const project = 'demo' in body ? createDemoProject() : createProject(body);
    return reply.code(201).send({ project: repo.insert(project) });
  });

  app.get<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    const p = repo.get(req.params.id);
    if (!p) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return { project: p };
  });

  app.patch<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    const body = saveProjectBody.parse(req.body);
    if (body.project.id !== req.params.id) return reply.code(400).send({ error: 'validation', message: 'ID do projeto não confere com a URL.' });
    const r = repo.save(body.project, body.baseRevision, body.label ?? 'Alteração');
    if (r.ok) return { project: r.project };
    if (r.reason === 'not_found') return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return reply.code(409).send({
      error: 'conflict',
      message: `O projeto foi alterado em outro lugar (revisão atual ${r.current}, sua base ${body.baseRevision}). Nada foi sobrescrito.`,
      currentRevision: r.current,
    });
  });

  app.delete<{ Params: { id: string } }>('/v1/projects/:id', async (req, reply) => {
    if (!repo.softDelete(req.params.id)) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/v1/projects/:id/revisions', async (req, reply) => {
    if (!repo.get(req.params.id)) return reply.code(404).send({ error: 'not_found', message: 'Projeto não encontrado.' });
    return { revisions: repo.revisions(req.params.id) };
  });

  app.get<{ Params: { id: string; rev: string } }>('/v1/projects/:id/revisions/:rev', async (req, reply) => {
    const p = repo.revision(req.params.id, Number(req.params.rev));
    if (!p) return reply.code(404).send({ error: 'not_found', message: 'Revisão não encontrada.' });
    return { project: p };
  });

  /** Restaurar cria uma NOVA revisão com o conteúdo antigo; o histórico nunca é reescrito. */
  app.post<{ Params: { id: string; rev: string } }>('/v1/projects/:id/revisions/:rev/restore', async (req, reply) => {
    const current = repo.get(req.params.id);
    const old = repo.revision(req.params.id, Number(req.params.rev));
    if (!current || !old) return reply.code(404).send({ error: 'not_found', message: 'Revisão não encontrada.' });
    const r = repo.save({ ...old, id: current.id }, current.revision, `Restaurada a revisão ${req.params.rev}`);
    if (!r.ok) return reply.code(409).send({ error: 'conflict', message: 'Conflito ao restaurar; recarregue o projeto.' });
    return { project: r.project };
  });

  return Object.assign(app, { repo });
};
