# Status das funcionalidades

Legenda: **Verificado** = implementado e testado (automático e/ou manual no navegador) ·
**Parcial** = funciona com restrições descritas · **Planejado** = não existe ainda.

Última atualização: 2026-11-08. Deploy: ver [deploy-vercel.md](deploy-vercel.md).

## Fase 1 — Fundação

| Item | Status | Observações |
|---|---|---|
| Monorepo (npm workspaces) | Verificado | `packages/core`, `apps/api`, `apps/web` |
| Banco de dados | Verificado | Produção: Supabase Postgres com RLS (aplicado no projeto arqeia; cadastro e salvamento confirmados em produção). Local: SQLite (`node:sqlite`). Mesma interface em `apps/api/src/repository.ts` |
| Cadastro de projetos (campos da seção 3.1) | Verificado | Nome, código, cliente, responsável, localização, tipo (10 tipos), terreno, pavimentos, unidade, escala, norte, fuso. Template demonstrativo |
| Persistência + revisões | Verificado | Cada salvamento gera uma revisão completa (até 200 por projeto); restaurar cria nova revisão |
| Concorrência otimista | Verificado | Salvar sobre revisão desatualizada → 409, nada é sobrescrito; a interface oferece carregar a versão do servidor ou gravar a sua como nova revisão |
| Autosave + recuperação | Verificado | Debounce de 1,2 s; rascunho em localStorage; recuperação oferecida ao reabrir; reenvio com backoff quando offline |
| Exclusão | Verificado | Lógica (soft delete) |
| Trilha de auditoria | Parcial | Tabela `audit_log` grava criação/salvamento/exclusão; sem interface de consulta |
| Autenticação | Parcial | Supabase Auth (e-mail + senha, confirmação, redefinição). API exige JWT válido; RLS garante que cada usuário só acessa os próprios projetos. Modo local sem login só em 127.0.0.1 |
| Organizações / papéis / compartilhamento | **Planejado** | Hoje cada projeto tem um único dono |
| Design system | Parcial | Tokens (claro/escuro, canvas escuro/papel), componentes básicos; sem biblioteca isolada em `packages/ui` |
| **Critério da fase:** criar, salvar, fechar e reabrir | Verificado | Teste automatizado na API + verificado no navegador com recarga completa |

## Fase 2 — Editor CAD 2D

| Item | Status | Observações |
|---|---|---|
| Modelo geométrico independente da UI, em mm | Verificado | `packages/core` |
| Linha, polilinha (aberta/fechada), retângulo, círculo, arco, texto | Verificado | |
| Parede (2D: eixo, espessura, altura) | Verificado | Junções e aberturas: ver Fase 3 |
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

## Fase 3 — BIM e 3D

Critério: *uma modificação em parede ou abertura atualiza corretamente o modelo e suas vistas.*
Verificado em teste automatizado (volume da malha muda com a largura da janela) e no navegador
(alterar a largura de uma janela, inserir porta, mover parede: planta e 3D mudam no mesmo commit; desfazer volta os dois).

| Item | Status | Observações |
|---|---|---|
| Paredes paramétricas | Verificado | Espessura, altura, deslocamento da base; **junções automáticas** em L, cruz/Y (vizinhas angulares) e T (termina na face da hospedeira); limite de meia-esquadria para ângulos muito agudos |
| Paredes unidas acompanham a edição | Verificado | Mover/editar uma parede arrasta as extremidades unidas (canto e T) na mesma transação; janelas das paredes arrastadas ficam no lugar |
| Portas | Verificado | Hospedadas na parede (mover/girar/espelhar/copiar/apagar a parede leva a porta); largura, altura, posição, dobradiça, lado de abertura; símbolo com folha e arco |
| Janelas | Verificado | Largura, altura, peitoril, posição; símbolo de caixilho; vidro e caixilho no 3D |
| Validação de vãos | Verificado | Vão fora da parede, sobreposto ou mais alto que a parede fica **vermelho na planta**, gera aviso no 3D e **não é recortado** até ser corrigido |
| Pisos | Verificado | Contorno por pontos (côncavo aceito, triangulação por orelhas), espessura, cota da face superior |
| Pavimentos | Verificado | Cota e pé-direito por pavimento; o 3D empilha os pavimentos pelas cotas; junções só entre paredes do mesmo pavimento |
| Cobertura de duas águas | Verificado | 3 cliques; inclinação %, beiral, altura dos beirais, espessura; cumeeira e oitões no 3D; projeção tracejada com caimento na planta |
| Geração 3D | Verificado | Malha derivada do modelo (`buildModelMesh`), fechada e orientada (volume exato testado); reconstruída a cada commit |
| Visualizador | Verificado | three.js, abas Planta 2D · Planta + 3D · 3D, órbita/pan/zoom, sombras, clique seleciona o mesmo objeto da planta; carregado sob demanda |
| Propriedades BIM | Verificado | Área bruta e líquida (sem vãos), volume, contagem de portas/janelas por parede; área do piso; cumeeira, ângulo e vão da cobertura |
| Schema v2 | Verificado | Campos novos opcionais; projetos v1 migram ao abrir; API aceita v1 e v2 |

**Limitações conhecidas (honestas):**
- Cobertura e cotas não acompanham as paredes automaticamente (são elementos independentes).
- Em nós com 3 ou mais paredes pode sobrar um pequeno vazio no centro do nó.
- Portas e janelas em 3D são genéricas (folha lisa; caixilho e vidro simples); famílias paramétricas virão com a Biblioteca (Fase 5).
- Ainda não há: escada, guarda-corpo, forro, ambientes com área automática, telhado de 4 águas.
- Edição de vãos pelo painel de propriedades; ainda não há arrastar o vão com o mouse.

## Fases 4 a 9

**Planejado.** Na interface aparecem desabilitadas e marcadas com a fase
(Documentação, Render Studio). Nenhuma integração com AutoCAD, Revit,
SketchUp ou Archicad existe ainda, e nenhuma é simulada.
