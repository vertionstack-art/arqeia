# Arquitetura

## Princípio

Um **modelo central** independente de fornecedor é a fonte de verdade. Planta,
3D, cortes, fachadas, pranchas e quantitativos são *derivados* dele. AutoCAD,
Revit, SketchUp e Archicad serão integrações externas (plugins nativos + conector
desktop), nunca o núcleo.

Fluxo-alvo (o mesmo que a referência demonstra em vídeo): **a planta é desenhada → vira 3D → as pranchas saem do modelo.**

## Camadas atuais

```text
apps/web  ──HTTP /v1──▶  apps/api  ──▶  SQLite (node:sqlite)
   │                         │
   └──── ambos importam ─────┴──▶  packages/core
```

### packages/core (TypeScript puro, sem dependências)

- `geometry/` — vetores, caixas, interseções (segmento, círculo, arco).
- `model/types.ts` — schema do projeto (`Project`, `Level`, `Layer`, `Entity`).
  Unidade interna **sempre milímetro**; unidades do projeto só afetam entrada/exibição.
- `model/entities.ts` — caixas envolventes, distância para seleção, pontos de snap,
  transformações, offset, medições.
- `model/edit.ts` — trim/extend.
- `history.ts` — toda edição é uma `Transaction` de `Change`s reversíveis
  (`before`/`after`). Isso dá desfazer/refazer e é a base para sincronização e auditoria.
- `snap.ts`, `spatial.ts`, `input.ts` — snaps com prioridade, índice espacial, parser de coordenadas.

### apps/api (Fastify + Zod + SQLite)

- `schema.ts` valida o projeto inteiro (tipos, números finitos, raios positivos,
  integridade referencial entidade→layer/pavimento).
- `db.ts`: tabelas `projects`, `revisions`, `audit_log`. Salvamento com concorrência
  otimista por número de revisão.

| Método | Rota | Função |
|---|---|---|
| GET | `/v1/health` | saúde |
| GET | `/v1/projects` | lista (resumos) |
| POST | `/v1/projects` | cria (campos da seção 3.1 ou `{demo:true}`) |
| GET | `/v1/projects/:id` | projeto completo |
| PATCH | `/v1/projects/:id` | salva `{project, baseRevision, label}` → 409 em conflito |
| DELETE | `/v1/projects/:id` | exclusão lógica |
| GET | `/v1/projects/:id/revisions` | histórico |
| GET | `/v1/projects/:id/revisions/:rev` | revisão completa |
| POST | `/v1/projects/:id/revisions/:rev/restore` | restaura como nova revisão |

### apps/web (React + Zustand + Canvas 2D)

- `editor/store.ts` — estado do editor; `commit()` aplica a transação, atualiza o
  índice espacial e registra no histórico.
- `editor/controller.ts` — ponteiro, teclado, snap, ortogonal e ferramenta ativa,
  fora do React (o movimento do mouse não re-renderiza componentes).
- `editor/tools.ts` — uma classe por ferramenta, com pré-visualização.
- `editor/render.ts` — desenho vetorial com culling pela vista; transformação
  mundo→tela em double por ponto (precisão com coordenadas grandes).
- `editor/autosave.ts` — debounce, rascunho local, conflito, backoff.

## Decisões e justificativas

| Decisão | Motivo | Revisitar quando |
|---|---|---|
| Vite + React (não Next.js) | O editor é uma SPA pesada em canvas; SSR não ajuda | Páginas públicas/marketing |
| Canvas 2D (não WebGL) no 2D | Simples, nítido em qualquer zoom; suficiente para plantas típicas | Arquivos com 100k+ entidades → WebGL/instancing |
| SQLite embutido | Zero infraestrutura para desenvolver; mesmo contrato do repositório | Multiusuário/produção → PostgreSQL |
| Fastify (não NestJS) | API pequena; NestJS adiciona cerimônia sem ganho agora | Quando houver muitos módulos/injeção de dependências |
| Projeto salvo inteiro por revisão | Simples e auditável | Projetos grandes → salvar transações incrementais (o histórico já as produz) |

## Próximas peças (Fase 3)

Elementos BIM (portas, janelas com vão booleano real, lajes, pisos), geração de
geometria 3D a partir das paredes e visualizador Three.js lendo **o mesmo** `Project`.
