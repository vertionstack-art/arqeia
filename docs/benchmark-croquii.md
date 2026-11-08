# Benchmark — Croquii

Auditoria funcional de **https://croquii.com** (site) e **https://app.croquii.com** (app),
feita em **2026-11-08** com a conta do próprio usuário (plano **Grátis**), pelo navegador dele.

## Método e limites

- **Site público:** leitura de home, `/precos`, `/recursos` e `/comparar/croqui-e-{autocad,revit,sketchup}`.
- **App logado:** navegação por todas as rotas do menu e pelas 15 áreas do projeto exemplo *Casa Moura — geminada*;
  leitura de texto, menus, diálogos, acessibilidade (rótulos de botões) e requisições de rede observáveis.
- **Nada foi criado, alterado ou excluído.** Não cliquei em "Gerar …", "Usar a Planta", "Exportar" (efetivo),
  "Convidar" nem "Excluir". Os dois avisos "Conferir diferenças antes de usar a Planta" foram fechados com **Agora não**.
  Ao sair das Pranchas, o app pediu para descartar um estado que ele mesmo montou ao abrir; nenhum trabalho do usuário foi perdido.
- **Sem acesso a código-fonte ou backend.** Uma chamada só com cookie à API retornou **401** (a API usa token próprio). Não tentei contornar.
- **Status:** *Verificado* = visto funcionando ou presente no app · *Anunciado* = só no site/texto, sem prova de funcionamento ·
  *Não verificado* = presente mas não exercitado (exigiria gravar dados) ou inacessível no plano Grátis.

## Tecnologia observada

| Item | Observação |
|---|---|
| Front-end | SPA React empacotada com Vite (`index-<hash>.js`); editor 2D em **canvas** (2 canvases sobrepostos) |
| API | `api.croquii.com`, autenticação por token (não cookie). Plantas salvas como documentos: `GET /canvas/{uuid}/documento` |
| Telemetria | PostHog via proxy no próprio domínio (`/ingest`), com web-vitals, exceções, *dead clicks* e *surveys* |
| Mapas | OpenStreetMap no desenho do lote |
| Fonte do modelo | Duas fontes possíveis por projeto: **IFC importado** ou **Planta desenhada**. Trocar exige reconciliação manual (diálogo "Conferir diferenças") |

## Inventário de telas

### Navegação global

| Rota | Conteúdo |
|---|---|
| `/` Início | "Primeiros passos" (4 etapas), upload DWG/DXF/IFC ou "desenhar a planta" |
| `/projetos` | Lista de projetos; o exemplo vem pronto |
| `/estudos` | Estudo preliminar em 5 etapas: Programa → Organograma → Leitura do terreno → Blocos → Alternativas |
| `/clientes` | CRM simples: PF/PJ, contato, projetos, orçamentos, a receber |
| `/biblioteca` (Famílias) | 493 itens em 10 categorias (309 revestimentos e texturas, 68 mobiliários…), importação de blocos de DWG, upload de elemento |
| `/biblioteca/especificacoes` | Itens com marca e modelo; importação de catálogo de tintas por CSV |
| `/biblioteca/convencoes` | **128 regras** de dimensionamento em 20 grupos, com norma de referência e severidade; regras de compatibilização "travadas" |
| `/biblioteca/estilo` | "Gosto do escritório" para a IA: estilos, imagens de referência, materiais, cores, "nunca fazemos", padrão dimensional, **memória que aprende** com aceitar/recusar propostas, upload de memoriais antigos para imitar o tom |
| `/escritorio` | Dados do carimbo (CNPJ, CAU, RRT), com prévia do carimbo |
| `/escritorio/identidade-visual` | Logo, cores (com contraste calculado), 7 fontes, capa, cabeçalho e rodapé, marca d'água, **papel timbrado em PDF**, 3 modelos de carimbo, **modelo DWT do AutoCAD** para o DXF exportado |
| `/escritorio/equipe` e `/acessos` | Responsáveis com registro (CAU/ABD); convites com papel Admin/Membro e visibilidade do financeiro por pessoa |
| `/financeiro` | Lançamentos, importação de extrato, custo-hora, modelo de contrato, propostas |

### Projeto (15 áreas)

| Área | O que tem | Estado no exemplo |
|---|---|---|
| Visão geral | Etapas (Planta, Documentação, Conferência, Com o cliente), prazos, atividade, disciplinas e responsáveis | Verificado |
| Planta (editor) | Ver seção "Editor" | Verificado (abertura e menus) |
| Pranchas | Jogo de apresentação com **25 páginas / 1.292 elementos** gerados em ~18 s; publicar, apresentar, exportar | Verificado |
| Modelo 3D | 3D do IFC, camadas (mobiliário 52, pontos 120), cubo de navegação, corte, medição, vistas salvas, captura de imagem, modo apresentação | Verificado |
| Conformidade | Pré-checagem NBR 9050 + código de obras | Visão geral diz "28 não conformes · 30 ok", mas a tela mostra **não gerado** |
| Quadro de áreas | Áreas legais, TO e CA | Visão geral "conferido", tela **não gerado** |
| Memorial | Memorial descritivo seção a seção | Visão geral "aprovado", tela **não gerado** |
| Quantitativos | Contagem de ambientes, esquadrias, louças, acabamentos | **não gerado** |
| Caderno | Especificações por ambiente | **não gerado** |
| Compatibilização | Rodadas (C03), ocorrências por disciplina com estado (aberta, em análise, aceita, resolvida) | Verificado (2 ocorrências) |
| Documentos | Repositório com versões (mesmo nome = nova versão); 49 arquivos | Verificado |
| Histórico | Comparação R00 × R01 (depende dos quantitativos de cada revisão) | Verificado (comparativo pendente) |
| Dados | Cliente, lote desenhado sobre OSM (450,2 m², testada, orientação), zoneamento, recuos, disciplinas, padrão dimensional | Verificado |
| Orçamento de móveis | Cada móvel do layout vira linha; R$ 153.950 em 52 de 108 itens | Verificado |
| Cronograma | 9 etapas com dependências, gráfico de barras, sincronização com agenda | Verificado |
| Financeiro do projeto | Contrato, etapas ligadas a entregáveis, parcelas por gatilho, **rentabilidade orçado × realizado** | Verificado (dados ilustrativos) |

### Editor de planta

- **Inspiração explícita no Revit:** painel de propriedades com Escala da vista, Nível de detalhe, Estilo visual, Visibilidade/Gráficos (VV), Faixa da vista (VR), Modelo de vista, Fases; navegador de projeto, Níveis, Tipos, Famílias, Reforma, Tabelas, Parâmetros, Referências, Versões e "Gerar com IA".
- **Barra de ferramentas** com abas Arquitetura, Estrutura, Aço, Sistemas, Inserir, Anotar, Analisar, Massa e terreno, Vista, Gerenciar e Modificar, usando os **mesmos atalhos do Revit** (WA, DR, WN, CM, RM, GR, RP, DI, EL, DL, TX, TG, VG, VR, RR, RG).
- **Anotar:** cotas alinhada, encadeada, contínua, angular, de raio, diâmetro, arco e linha de base; elevação, coordenada e inclinação de ponto; linhas de detalhe, hachura (região), textos, identificadores, notas-chave, nuvem de revisão.
- **Vista:** corte, elevação, chamada de detalhe, planta de forro refletido, câmera, percurso virtual, renderização e galeria, tabelas e quantidades, lista de pranchas.
- **Massa e terreno:** massa conceitual, superfície e sólido topográfico, divisas, curvas de nível, platô, **entorno pelo mapa**.
- **Importar:** DWG, IFC, PDF ou imagem.
- **Exportar (funcionando):** DXF, OBJ, GLB, DAE, IFC, IFC 2x3, gbXML. **Listados, mas o app diz que "ainda não estão ligados":** DGN, STEP, SAT, DWF, FBX. **Não há exportação para DWG.**
- 12 avisos de verificação abertos no exemplo; Norte a 322°.

## Tabela de benchmark

| Módulo | Funcionalidade | Fluxo | Evidência | Limitação | Nossa solução (Traço) | Prioridade | Status |
|---|---|---|---|---|---|---|---|
| Entrada | Importar DWG/DXF/IFC/PDF/imagem | Início ou Arquivo → Importar | Menu Arquivo, Início | Versões de DWG/IFC não informadas | Pipeline de importação com matriz de capacidade e relatório de perdas (Fase 5) | P0 | Verificado (opção presente; importação não executada) |
| Entrada | Ler SketchUp (.skp) | — | Página de comparação | **Não suportado**; exige DWG ou redesenho | Adaptador SKP via conector/SDK (Fase 5–6) | P2 | Anunciado (ausência declarada) |
| Modelo | Fonte de verdade | Projeto usa IFC **ou** Planta | Diálogo "Conferir diferenças" | Duas fontes divergentes; reconciliação manual; documentos ficam "não gerados" quando a fonte troca | **Modelo central único** já em `packages/core`; IFC é importado *para* o modelo, nunca concorre com ele | P0 | Verificado |
| Editor 2D | Paredes, portas, janelas, ambientes, escadas, telhado, forro, marcenaria | Barra Arquitetura | Menu e atalhos | Implementação de cada item não verificada | Editor CAD real (Fases 2–3); hoje temos paredes, cotas, snaps e edição | P0 | Não verificado (listado) |
| Editor 2D | Cotas (alinhada, angular, raio, contínua…) | Barra Anotar | Menu | Idem | Hoje: cota alinhada; angular, radial e nível no roteiro | P1 | Não verificado (listado) |
| Editor 2D | UI estilo Revit (VV, VR, faixa da vista, fases, modelos de vista) | Painel de propriedades | Rótulos de acessibilidade | Curva de aprendizado de Revit para quem vem do AutoCAD/SketchUp | Linha de comando estilo AutoCAD + painéis contextuais; perfis de atalho (AutoCAD/Revit) | P2 | Verificado |
| 3D | Visualização 3D com camadas, corte e medição | Projeto → Modelo 3D | Tela | Sem modelagem livre; 3D vem da planta/IFC | Visualizador Three.js do mesmo modelo + edição 3D (Fase 3) | P0 | Verificado |
| Render | Imagens com IA a partir do 3D | 3D → Capturar / Apresentação | Site e tela | Não é render fotorrealista físico; IA pode alterar a cena | Render Studio com path tracing fiel ao modelo + IA separada e rotulada (Fase 7) | P1 | Anunciado (não executado) |
| Documentação | Pranchas ABNT e de apresentação | Pranchas → Jogo | 25 páginas geradas | Formatos A1–A3 (sem A0/A4 anunciados) | Gerador de pranchas A0–A4 a partir do modelo (Fase 4) | P0 | Verificado |
| Documentação | Cortes e fachadas gerados | Vista → Corte / Elevação | Menu; site | Não exercitado | Cortes e fachadas N/L/S/O por geometria real (Fase 4) | P0 | Não verificado |
| Documentação | Quadro de áreas, TO, CA, permeável | Quadro de áreas → Gerar | Tela | No exemplo: "não gerado" apesar do status "conferido" | Quadros derivados ao vivo do modelo (sem passo "gerar") | P0 | Não verificado |
| Documentação | Memorial NBR 13532 no tom do escritório | Memorial → Gerar | Tela; Gosto do escritório | Depende de IA; idem inconsistência de status | Memorial gerado de dados do modelo + IA opcional revisável (Fase 8–9) | P1 | Não verificado |
| Normas | Pré-checagem NBR 9050 + Plano Diretor | Conformidade → Gerar | Tela; site | Plano Diretor **só de Florianópolis** | Motor de regras configurável por município, com fonte rastreável | P1 | Não verificado |
| Regras | 128 convenções de dimensionamento + compatibilização | Biblioteca → Convenções | Tela completa | Catálogo próprio (não verificado contra normas) | Biblioteca de regras com norma, versão e severidade; editável pelo escritório | P1 | Verificado |
| Compatibilização | Ocorrências por disciplina (móvel × pilar, tubo × viga…) | Projeto → Compatibilização | Rodada C03 com 2 ocorrências | Só regras internas; sem BCF anunciado | Detecção de interferências + BCF (Fase 9) | P2 | Verificado |
| Interiores | Layout, pontos, paleta, orçamento por cômodo | Projeto → Orçamento de móveis | R$ 153.950 / 108 itens | Plano grátis: 5 usos de IA | Biblioteca 3D + orçamento ligado a itens do modelo | P2 | Verificado |
| Estudo preliminar | Programa → organograma → terreno → blocos → 3 alternativas | Estudos | Tela | — | Assistente de estudo (Fase 8) | P2 | Verificado |
| Terreno | Lote desenhado sobre OpenStreetMap, orientação, recuos | Projeto → Dados | Tela | — | Planta de situação/implantação com dados geográficos licenciados (Fase 4) | P1 | Verificado |
| Revisões | R00 × R01 com o que mudou | Histórico | Tela | Comparativo depende de "gerar quantitativos" | Revisões já implementadas (servidor) + diff semântico por elemento | P1 | Verificado |
| Exportação | DXF, OBJ, GLB, DAE, IFC, IFC 2x3, gbXML | Arquivo → Exportar CAD e 3D | Diálogo | **Sem DWG**; DGN/STEP/SAT/DWF/FBX "não ligados" | DXF/IFC/GLB + DWG via SDK licenciado (Fase 4–5) | P1 | Verificado (diálogo) |
| Integração AutoCAD | DXF com modelo DWT do escritório | Identidade visual → Modelo DWT | Tela | **Sem plugin**; ida e volta por arquivo | Plugin .NET com inserção confirmada no desenho aberto (Fase 6) | P0 (diferencial) | Verificado (sem plugin) |
| Integração Revit | IFC exportado do Revit | Upload | Site: "não é plugin do Revit" | **Mão única**, sem plugin | Add-in Revit + IFC bidirecional (Fase 6) | P0 (diferencial) | Anunciado (ausência declarada) |
| Integração SketchUp / Archicad | — | — | Site | Sem SKP; Archicad só via IFC | Extensão Ruby SketchUp; Archicad via API JSON/Add-On (Fase 6) | P1 (diferencial) | Anunciado (ausência declarada) |
| Identidade | Carimbo, logo, cores com contraste, fontes, papel timbrado, DWT | Escritório → Identidade visual | Tela | — | Editor de pranchas com carimbo personalizado (Fase 4) | P1 | Verificado |
| Cliente | Portal por link, aprovação item a item | Compartilhar / Publicar | Site; atividade "Aprovado por Helena" | Fluxo do cliente não exercitado | Portal de aprovação (Fase 8) | P2 | Não verificado |
| Gestão | Clientes, propostas, contrato com assinatura, financeiro, horas, rentabilidade | Financeiro; projeto → Financeiro | Telas | Plano grátis limitado (3 contratos, 30 lançamentos) | Fora do núcleo CAD/BIM; avaliar depois da Fase 9 | P3 | Verificado |
| Equipe | Papéis Dono/Admin/Membro, financeiro por pessoa | Escritório → Acessos | Tela | Permissão por pessoa só no plano Estúdio | Organizações e papéis (pendente no Traço) | P1 | Verificado |
| IA | Memória do gosto do escritório; nomes anonimizados antes da IA | Biblioteca → Gosto do escritório | Tela; site | Uso de IA em memorial/estudo não detalhado | IA com comandos validados e prévia (Fase 8) | P2 | Verificado (tela) / Anunciado (anonimização) |

## Planos (site, 2026-11-08)

Grátis (3 projetos, sem cartão) · **Autônomo** a partir de R$ 67/mês (1 pessoa, 3 projetos ativos, 10 GB) ·
**Escritório** (até 5 pessoas, ilimitado, 200 GB, gestão completa) · **Estúdio** (até 12, 500 GB, permissão por pessoa).
Pagamento por Pix ou cartão. Oferta de fundador: 10% por 12 meses até 15/12.

## Conclusões para o Traço

**Onde o Croquii é forte (precisamos igualar):**
1. Documentação gerada do modelo, com carimbo e identidade do escritório.
2. Catálogo de regras (convenções + compatibilização) com norma e severidade.
3. Fluxo completo do escritório: cliente, aprovação, contrato, financeiro ligado às etapas.
4. Interiores com orçamento por item e um jogo de apresentação de 25 páginas.

**Onde há espaço para superar (verificado):**
1. **Fonte de verdade dupla** (IFC × Planta) com reconciliação manual, e documentos que ficam "não gerados" quando a fonte muda. O Traço já nasce com um modelo único.
2. **Sem plugins nativos:** Revit só por IFC de mão única, AutoCAD só por DXF, sem SKP. Os conectores da Fase 6 são o diferencial central.
3. **Sem exportação DWG**, e 5 formatos anunciados no diálogo ainda desligados.
4. **Normas municipais só de Florianópolis.** Um motor de regras por município é uma vantagem clara no Brasil.
5. **3D derivado, sem modelagem livre**, e imagens por IA em vez de render físico fiel.
6. Status do exemplo **inconsistente** ("conferido/aprovado" na visão geral, "não gerado" nas telas): quadros derivados ao vivo evitam isso.

**Não verificado nesta auditoria:** execução real das ferramentas de desenho, cortes/fachadas, geração de memorial,
quadros, conformidade, exportação efetiva, portal do cliente, versão mobile e qualidade das imagens com IA.
Todas exigiriam criar ou alterar dados na conta; podem ser feitas num projeto de teste se o usuário autorizar.
