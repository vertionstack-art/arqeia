# Status das funcionalidades

Legenda: **Verificado** = implementado e testado (automático e/ou manual no navegador) ·
**Parcial** = funciona com restrições descritas · **Planejado** = não existe ainda.

Última atualização: 2026-11-07.

## Fase 1 — Fundação

| Item | Status | Observações |
|---|---|---|
| Monorepo (npm workspaces) | Verificado | `packages/core`, `apps/api`, `apps/web` |
| Banco de dados | Parcial | SQLite local (`node:sqlite`). PostgreSQL/PostGIS previsto para produção; o repositório está isolado em `apps/api/src/db.ts` |
| Cadastro de projetos (campos da seção 3.1) | Verificado | Nome, código, cliente, responsável, localização, tipo (10 tipos), terreno, pavimentos, unidade, escala, norte, fuso. Template demonstrativo |
| Persistência + revisões | Verificado | Cada salvamento gera uma revisão completa (até 200 por projeto); restaurar cria nova revisão |
| Concorrência otimista | Verificado | Salvar sobre revisão desatualizada → 409, nada é sobrescrito; a interface oferece carregar a versão do servidor ou gravar a sua como nova revisão |
| Autosave + recuperação | Verificado | Debounce de 1,2 s; rascunho em localStorage; recuperação oferecida ao reabrir; reenvio com backoff quando offline |
| Exclusão | Verificado | Lógica (soft delete) |
| Trilha de auditoria | Parcial | Tabela `audit_log` grava criação/salvamento/exclusão; sem interface de consulta |
| Autenticação / organizações / permissões | **Planejado** | Não implementado. A API escuta só em 127.0.0.1 por isso. Bloqueador para qualquer uso multiusuário |
| Design system | Parcial | Tokens (claro/escuro, canvas escuro/papel), componentes básicos; sem biblioteca isolada em `packages/ui` |
| **Critério da fase:** criar, salvar, fechar e reabrir | Verificado | Teste automatizado na API + verificado no navegador com recarga completa |

## Fase 2 — Editor CAD 2D

| Item | Status | Observações |
|---|---|---|
| Modelo geométrico independente da UI, em mm | Verificado | `packages/core` |
| Linha, polilinha (aberta/fechada), retângulo, círculo, arco, texto | Verificado | |
| Parede (2D: eixo, espessura, altura) | Parcial | Sem junções automáticas entre paredes nem aberturas (Fase 3) |
| Cota alinhada | Verificado | Linear horizontal/vertical = alinhada com pontos alinhados. Angular, radial e de nível: planejado |
| Mover, copiar, rotacionar, escalonar, espelhar | Verificado | Escalonar não altera espessura/altura de paredes (parâmetros construtivos) |
| Offset | Verificado | Linha, polilinha (quinas em meia-esquadria), círculo, arco |
| Aparar (trim) | Verificado | Linha, arco, círculo. Polilinha: explodir antes |
| Estender (extend) | Parcial | Apenas linhas |
| Explodir | Verificado | Polilinha e parede → linhas |
| Medir distância, área e perímetro | Verificado | |
| Seleção simples, múltipla, janela, cruzamento | Verificado | |
| Snaps: extremidade, médio, centro, quadrante, interseção, perpendicular, tangente, mais próximo, grade | Verificado | "Mais próximo" desligado por padrão |
| Ortogonal, entrada absoluta/relativa/polar, distância direta, sufixos de unidade | Verificado | |
| Unidades métricas e imperiais | Verificado | Entrada/exibição; armazenamento sempre em mm |
| Layers (criar, renomear, cor, espessura, ocultar, bloquear, excluir vazio) | Verificado | Alterações de layer entram no desfazer |
| Pavimentos (criar, renomear, cota, pé-direito, excluir vazio) | Verificado | |
| Desfazer/refazer | Verificado | Inclui entidades, layers e pavimentos |
| Índice espacial, culling, LOD de texto | Verificado | Grade uniforme; pode ser trocado por R-tree |
| Precisão com coordenadas grandes | Parcial | Transformação em double por ponto; sem teste com coordenadas UTM ainda |
| Elipse, spline, hachura, multitexto, blocos, grupos, alinhar/distribuir | **Planejado** | Não aparecem na interface |
| Edição por grips (arrastar vértices) | **Planejado** | Edição numérica pelo painel de propriedades |

## Fases 3 a 9

**Planejado.** Na interface aparecem desabilitadas e marcadas com a fase
(Editor 3D, Documentação, Render Studio). Nenhuma integração com AutoCAD, Revit,
SketchUp ou Archicad existe ainda, e nenhuma é simulada.
