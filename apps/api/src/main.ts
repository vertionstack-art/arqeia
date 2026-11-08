import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { buildApp } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.TRACO_DB ?? resolve(here, '../data/traco.db');
const port = Number(process.env.PORT ?? 4310);
// Por padrão escuta só em loopback: não há autenticação ainda (ver docs/limitacoes.md).
const host = process.env.HOST ?? '127.0.0.1';

const app = buildApp({ dbPath, logger: true });
app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
