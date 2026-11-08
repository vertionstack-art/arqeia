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
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

let repo: ProjectRepository;
let auth: AuthMode;

if (supabaseUrl && supabaseKey) {
  const cfg = { url: supabaseUrl, publishableKey: supabaseKey };
  repo = new SupabaseRepository(cfg);
  auth = { mode: 'token', verify: (t) => verifySupabaseToken(cfg, t) };
} else {
  if (onVercel) {
    // Falha alto em vez de publicar uma API aberta e sem persistência.
    throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórias na Vercel.');
  }
  const { SqliteRepository } = await import('./db.js');
  const here = dirname(fileURLToPath(import.meta.url));
  repo = new SqliteRepository(process.env.TRACO_DB ?? resolve(here, '../data/traco.db'));
  auth = { mode: 'none' };
}

const port = Number(process.env.PORT ?? 4310);
// Sem login (modo local) a API só escuta em loopback.
const host = process.env.HOST ?? (onVercel ? '0.0.0.0' : '127.0.0.1');

const app = buildApp({ repo, auth, logger: true });
app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

export default app;
