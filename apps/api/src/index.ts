import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { buildApp, type AuthMode } from './app.js';
import type { ProjectRepository } from './repository.js';
import { SupabaseRepository, verifySupabaseToken } from './supabase-repo.js';

/**
 * Ponto de entrada (reconhecido pela Vercel como app Fastify).
 *
 * Com SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY → Postgres com RLS e login obrigatório.
 * Sem elas → SQLite local sem login, permitido APENAS fora da Vercel e em loopback.
 */
const onVercel = !!process.env.VERCEL;

const createBackend = async (): Promise<{ repo: ProjectRepository; auth: AuthMode }> => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const cfg = { url, publishableKey: key };
    return { repo: new SupabaseRepository(cfg), auth: { mode: 'token', verify: (t) => verifySupabaseToken(cfg, t) } };
  }
  if (onVercel) {
    // Falha alto em vez de publicar uma API aberta e sem persistência.
    throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórias na Vercel.');
  }
  // Import dinâmico: o SQLite (node:sqlite) só é carregado no modo local.
  const { SqliteRepository } = await import('./db.js');
  const here = dirname(fileURLToPath(import.meta.url));
  return { repo: new SqliteRepository(process.env.TRACO_DB ?? resolve(here, '../data/traco.db')), auth: { mode: 'none' } };
};

const start = async () => {
  const { repo, auth } = await createBackend();
  const app = buildApp({ repo, auth, logger: true });
  // Na Vercel, segue o formato documentado para Fastify: apenas `listen` na porta
  // fornecida (a plataforma encaminha as requisições). A instância NÃO é exportada:
  // um default export seria tratado como handler (req, res), e o Fastify não é chamável.
  // Localmente, sem login, a API só escuta em loopback.
  const options = onVercel
    ? { port: Number(process.env.PORT ?? 3000) }
    : { port: Number(process.env.PORT ?? 4310), host: process.env.HOST ?? '127.0.0.1' };
  await app.listen(options);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
