# Traço — plataforma CAD/BIM para arquitetura

Editor arquitetônico no navegador, construído sobre um **modelo central próprio**:
a planta é desenhada com medidas reais e, nas próximas fases, o mesmo modelo gera
o 3D, os cortes, as fachadas e as pranchas.

> Estado atual: **Fases 1 e 2** (fundação + editor CAD 2D). Veja
> [`docs/status.md`](docs/status.md) para a lista do que está pronto, parcial e planejado.

## Requisitos

- Node.js **24+** (usa o `node:sqlite` embutido; sem Docker nem dependências nativas)
- npm 11+

## Rodar

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://127.0.0.1:4310 (o Vite encaminha `/v1` para ela)
- Banco local: `apps/api/data/traco.db` (criado automaticamente; mude com `TRACO_DB`). Sem login neste modo.
- Produção (Vercel + Supabase com login): veja [`docs/deploy-vercel.md`](docs/deploy-vercel.md)

Para rodar separadamente: `npm run dev:api` e `npm run dev:web`.

## Testes

```bash
npm test          # core (geometria, snap, histórico, trim/offset…) + API
npm run typecheck
```

## Estrutura

```text
traco-arq/
├── packages/core/   modelo de dados, geometria, snap, histórico (sem dependências de UI)
├── apps/api/        API REST versionada (/v1) — Fastify + Zod; Supabase (produção) ou SQLite (local)
├── apps/web/        app React (dashboard + editor 2D em canvas)
├── supabase/        migrações SQL (tabelas, RLS, funções)
├── vercel.json      serviços web (/) e api (/v1)
└── docs/            arquitetura, status, deploy, benchmark
```

## Usando o editor

| Ação | Como |
|---|---|
| Comandos | Digite com o foco no desenho: `L` linha, `W` parede, `PL` polilinha, `REC` retângulo, `C` círculo, `A` arco, `T` texto, `DIM` cota, `M` mover, `CO` copiar, `RO` rotacionar, `SC` escalonar, `MI` espelhar, `O` offset, `TR` aparar, `EX` estender, `DI` medir, `AA` área, `X` explodir, `E` apagar, `Z` enquadrar |
| Coordenadas | `3,4` absoluta · `@2,0` relativa · `@5<90` polar · `2.5` distância na direção do cursor · sufixos `cm`, `mm`, `m`, `in`, `ft` |
| Confirmar / cancelar | Enter ou botão direito / Esc (Enter vazio repete o último comando) |
| Seleção | Clique; Shift soma; arrastar da esquerda para a direita = janela, da direita para a esquerda = cruzamento |
| Navegação | Roda do mouse = zoom no cursor; botão do meio ou Espaço + arrastar = pan |
| Precisão | F3 snap a objetos · F9 snap à grade · F8 ortogonal · F7 mostrar grade |
| Histórico | Ctrl+Z / Ctrl+Y · Ctrl+S salva imediatamente |
