# Deploy na Vercel (com Supabase)

O repositório é um projeto Vercel de **vários serviços** (`vercel.json`):

| Serviço | Pasta | Público em | Observação |
|---|---|---|---|
| `web` | `apps/web` | `/` | Vite (app React) |
| `api` | `apps/api` | `/v1/*` | Fastify; o caminho `/v1/...` chega inalterado à API |

Não há *bindings*: o navegador chama `/v1` no mesmo domínio; nenhum serviço chama o outro.

## 1. Supabase (uma vez)

1. Crie uma organização/projeto no Supabase da **Vertion Stack** (região São Paulo, `sa-east-1`).
2. No **SQL Editor**, rode todo o conteúdo de [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
   Cria `projects`, `revisions`, `audit_log`, as políticas RLS e as funções `create_project`/`save_project`.
3. Em **Authentication → URL Configuration**, defina **Site URL** = domínio da Vercel
   (ex.: `https://arqeia.vercel.app`) e adicione `http://localhost:5173` em *Redirect URLs*.
   Sem isso, os links de confirmação de e-mail e de redefinição de senha apontam para o lugar errado.
4. Copie de **Project Settings → API**: a *Project URL* e a **Publishable key** (`sb_publishable_…`).
   **Nunca** use a `service_role`/secret key no front-end nem na API: o acesso é sempre como o usuário logado, e o RLS protege os dados.

## 2. Variáveis de ambiente na Vercel

No import (ou em *Settings → Environment Variables*), para Production e Preview:

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_URL` | Project URL (mesmo valor) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key (mesmo valor) |

As `VITE_*` são embutidas no build do `web`; as outras são lidas pela `api` em tempo de execução.
Se as da API faltarem, ela **se recusa a subir** na Vercel (em vez de publicar uma API aberta e sem persistência).

## 3. Import

Importe `vertionstack-art/arqeia` com a predefinição **Services** e diretório raiz `./`.
O `vercel.json` da raiz define os serviços; não é preciso configurar build por serviço no painel.

## Desenvolvimento local

- Sem `.env.local` em `apps/web`: modo local (API SQLite, sem login, só em 127.0.0.1).
- Com Supabase local ou remoto: crie `apps/web/.env.local` (veja `.env.example`) e rode a API com
  `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` definidas.

## Ainda não verificado

O primeiro deploy é o teste real destes pontos (não há como simulá-los fora da Vercel):

- instalação do monorepo (npm workspaces) a partir de `apps/api` e `apps/web`;
- detecção do Fastify em `apps/api/src/index.ts` e execução do `npm run build` (compila `packages/core` para `dist`).

Se algo falhar, os logs de build da Vercel indicam o passo; corrigimos a partir deles.
