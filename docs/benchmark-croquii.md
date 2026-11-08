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

## Auditoria profunda — testes práticos (2026-11-08)

Com autorização do usuário para "clicar em tudo", foi criado o projeto **"Teste auditoria Traço"**
(1 das 3 vagas grátis; pode ser excluído depois). Ações irreversíveis ou que saem da conta (excluir, convidar,
enviar ao cliente, assinar plano, baixar arquivos) **não** foram executadas.

### Menus globais

| Item | Resultado |
|---|---|
| "O que você quer fazer?" (`?`) | Paleta de ações: mandar ao cliente (WhatsApp/e-mail), importar DWG, quadro de áreas, pranchas em PDF, estudar terreno, gerar plantas pelo programa, nova proposta, completar carimbo… |
| Dúvidas | Ajuda contextual por tela, com tour e "Falar com a gente" |
| Horas | Cronômetro + apontamento manual por semana |
| Notificações | Abas Todas / Precisam de você / Clientes / Sistema |
| Busca (Ctrl K) | Telas e ações recentes; busca por "corte" achou só "Conferir pranchas" |
| Minha conta | Nome, assinatura manuscrita para contratos, senha, escritórios, tours, preferências de e-mail, **agenda (Google/Apple/Outlook) por link** |
| Plano | Preços confirmados: **Autônomo R$ 67 · Escritório R$ 97 · Estúdio R$ 147 (+R$ 29/pessoa)**. Cotas grátis: 30 lançamentos, 3 orçamentos, 3 projetos, 1 convite, 5 usos de IA, 3 apresentações publicadas |
| Indique e ganhe | 20% do 1º pagamento do indicado, via Pix |

### Projeto exemplo — gerar documentos

- "Gerar quadro de áreas" abre o aviso **"Usar a Planta"**; com "Agora não", **nada é gerado**.
  O exemplo não regenera documentos a partir do IFC: fica preso entre as duas fontes (achado de UX).
  Não troquei a fonte para não degradar o exemplo de forma irreversível.

### Novo projeto (assistente de 6 passos) — Verificado

1. Tipo: Construção nova · Reforma · Interiores · Regularização (ou partir de 15 projetos-modelo).
2. Origem: desenhar · IFC · DWG/DXF · gerar estudo · trazer depois.
3. Lote: município (lista de todos os municípios do IBGE), zona, área. **Bug:** o filtro da lista não respondeu ao texto digitado.
4. Tipologia: unifamiliar · multifamiliar · comercial.
5. Interiores sim/não.
6. Nome, cliente, responsável técnico, padrão dimensional, nº de moradores.

### Editor — testes reais

| Teste | Resultado | Status |
|---|---|---|
| Atalho digitado "WA" | **Não ativou a parede**: as teclas foram lidas uma a uma (trocou para a aba Estudo e o estilo para "Estrutura de arame") | Falha (via automação) |
| Parede pelo botão | Barra de comando com **Distância, Ângulo, Espessura**, trava angular, Orto (F8), "a partir de", paralela (OF). Traçado só Linha ou Arco | Verificado |
| Distância digitada | 1º segmento saiu com **6,00 m exatos**; nos seguintes a direção seguiu o último movimento do mouse, gerando paredes tortas | Parcial |
| Contorno por cliques | 4 paredes de 15 cm com **cantos unidos automaticamente** | Verificado |
| Propriedades da parede | Restrição de base/topo, altura 2,92 m, comprimento 6,03 m, área, volume, fases, material, parâmetros; cota temporária | Verificado |
| Barra Modificar | Mover, copiar, girar, espelhar, matriz, aparar, dividir, alinhar, fixar, excluir, criar bloco/similar, filtro | Verificado (presença) |
| Ambiente (clique dentro) | Detecção automática do recinto: **15,57 m²** pela face interna | Verificado |
| Porta | Prévia na parede com cota até o canto, largura 0,80, offset, Espaço inverte; **vão real** e arco de giro | Verificado |
| Janela | Inserida com vão na parede | Verificado |
| Desfazer | Ctrl+Z desfez paredes corretamente | Verificado |
| Enquadrar | Menu de zoom: enquadrar tudo (Shift+1), seleção (Shift+2), 25–400%, grade, wireframe, fundo escuro | Verificado |
| Corte | Linha de corte "A" com chamada e direção ("olhar para"); aparece no Navegador como **Corte AA** | Verificado (criação) |

### Documentação gerada no projeto de teste (~20 s)

| Documento | Resultado | Status |
|---|---|---|
| Quadro de áreas | Construída 19,12 m², útil 15,57 m², **TO 6,4%** (= 19,12/300), CA 0,05; checklist "pronto para protocolo" 3 de 6 | Verificado, números corretos |
| Quantitativos | 1 ambiente, 2 esquadrias | Verificado |
| Memorial | 13 seções NBR 13532, revisão seção a seção. Fundações remete ao projeto estrutural (não inventa). Esquadrias lista corretamente **Janela 1,20×1,20 e Porta 0,80×2,10**. Trechos de IA rotulados "Escrito pela IA, confira" | Verificado |
| Caderno | 3 lacunas, 2 a confirmar | Verificado |
| Conformidade | Em São Paulo: "Nenhuma regra se aplicou · informe zona e lote" → **sem regras fora de Florianópolis** | Verificado |
| Pranchas | 5 pranchas A3 1:50 desenhadas **no navegador**, salvas como **SVG** (uma por folha) + **PDF**; modelo salvo como `Planta do Croqui.json` (1,4 KB) | Verificado |
| Prévia de prancha em Documentos | **Imagem quebrada**: arquivo em Cloudflare R2 (link assinado) não carregou | Falha (bug) |

### 3D e IA

| Teste | Resultado | Status |
|---|---|---|
| 3D da planta desenhada | Paredes, piso, **vãos de porta e janela** corretos; sem cobertura (não desenhada) | Verificado |
| Ferramentas 3D | Corte, medir, câmeras, estilo Realista, **explodir pavimentos**, sol e sombras, balde de material, nível de detalhe, 9 vistas ortogonais/isométricas | Verificado (presença) |
| Qualidade 3D | Automático · Compacto · Padrão · Apresentação (sombras nítidas + oclusão de ambiente) | Verificado |
| Capturar imagem | Captura raster da tela 3D até 4× (4.860×2.060), JPEG ou PNG transparente — **não é render fotorrealista** | Verificado (não baixado) |
| IA · Render | **"Indisponível agora. A IA não está ligada neste ambiente (falta a chave do serviço de IA)"** | **Falha em produção** |
| IA · Sugerir layout | Exige tipo de ambiente; após definir "Sala de estar", ficou **>5 min "Sugerindo"** e mostrou "Não foi possível conectar ao servidor" (prometido: até 1 min) | **Falha** |
| Painel IA | Render, Decorar foto, Gerar planta, Planta da foto, Sugerir layout, Família da foto, Preencher moodboard; cota grátis: 2 imagens/mês | Verificado (presença) |

### Parte 2 — cortes, telhado, ferramentas, Estudo, Reforma, Financeiro, publicação (2026-11-08)

#### Catálogo de ferramentas

O editor expõe **cerca de 250 ferramentas** em 11 grupos com os nomes e atalhos do Revit:
Arquitetura, Estrutura, Aço, Sistemas (AVAC, hidráulica, elétrica), Inserir, Anotar, Analisar,
Massa e terreno, Vista, Gerenciar e Modificar. Uma amostra foi acionada de verdade:

| Ferramenta | Resultado | Status |
|---|---|---|
| Escada/rampa, Forro, Guarda-corpo, Elevação, Corte, Superfície topográfica, Conexão automática (aço), Módulo de marcenaria, Reconhecer paredes | Cada uma abre seu prompt próprio ("Clique no ambiente da escada…", "Enter põe as 4 elevações"…) | Verificado (início do comando) |
| Telhado | Contorno por cliques, beiral 0,60 m, inclinação 30% (16,7°), platibanda; gerou **telhado de 4 águas com cumeeira e espigões**, tipo "Telha cerâmica", e aparece correto no 3D | **Verificado** |
| Cargas de aquecimento e resfriamento | Cálculo real: Sala 15,57 m² → 8.400 BTU/h (158 W/m²), com aviso de que não substitui a NBR 16401 nem a ART | Verificado |
| Entorno pelo mapa | Ruas, lotes e edificações do OpenStreetMap (exige o projeto no mapa) | Verificado (diálogo) |
| Levantamento por trena | Mede cômodos por dentro e gera paredes e ambientes | Verificado (diálogo) |
| Worksets | Painel real (criar workset, mover seleção) | Verificado (versão mínima) |
| Verificação de interferência | "Não há modelo de disciplina vinculado… importe um IFC" | Verificado (depende de IFC) |
| Projeto generativo | Variações de manchas do modo Estudo (±15%) | Verificado (versão mínima) |
| Programação visual | **Admite "versão mínima"**: macro = lista de comandos de texto, "sem nós nem scripts" | Rótulo maior que a função |
| Restaurar backup | Abre o painel Versões | Verificado |

Achado: a sondagem por script (sem clique real) não abria os painéis; com clique real todos responderam.
Nenhum item testado era botão morto. Vários, porém, são versões bem mais simples do que o nome do Revit sugere.

#### Cortes, fachadas e cotas

| Teste | Resultado | Status |
|---|---|---|
| Abrir a vista "Corte AA" (duplo clique, Enter, chamada no desenho) | **Não abre vista de corte**: só seleciona e enquadra a linha na planta | Falha / ausente |
| Comando Vista nas Pranchas | Só oferece o pavimento (Térreo); cortes e elevações não podem ser postos numa folha | Ausente |
| Marca de elevação | Criada e listada em "Elevações" no Navegador | Verificado (criação) |
| Pranchas geradas (regeneradas após as marcas) | Planta baixa com cadeias de cotas · **Cortes AA e BB** · 4 fachadas · elevações internas da Sala | Verificado |
| Qualidade dos cortes | Esquemáticos: contorno das paredes, linha de piso e janela; **sem laje, cobertura nem cotas de nível legíveis** | Parcial |
| Relação com a linha de corte do usuário | O "Corte AA" gerado é **longitudinal e automático**; ignora a linha desenhada (transversal), e o BB nasce sozinho | Falha de modelo |
| "Abrir" Pranchas no aviso de documentação gerada | Leva a um jogo "Apresentação ao cliente" **vazio**; as 5 folhas ficam em outra tela (Conferir pranchas) | Inconsistência |
| Exportar CAD e 3D | DXF, OBJ, GLB, DAE, IFC, IFC 2x3 e gbXML no navegador; DGN, STEP, SAT, DWF e FBX desligados com aviso honesto | Verificado (não baixado) |

#### Modo Estudo e assistente de estudos

| Teste | Resultado | Status |
|---|---|---|
| Ferramentas do modo | Mancha, Ligação, Setorizar, Converter em paredes | Verificado |
| Programa "Residência" | Cria a lista (sala, cozinha, serviço, suíte, 2 dormitórios, banheiros, garagem) com "0 de 1 colocado" e **cria um estudo na conta** | Verificado |
| Mancha → Setorizar → Converter | Bolha de 12 m² → retângulo → **4 paredes + 1 ambiente reais** (10,25 m² internos); a Sala vizinha recalculou para 13,82 m² pela sobreposição. Desfeito depois | **Verificado** |
| Vínculo mancha ↔ programa | A mancha nasceu como "Mancha" genérica; o item do programa continuou "0 de 1 colocado" | Falha de UX |
| Assistente (Estudos) | 5 etapas: Programa → Organograma → Leitura do terreno → Blocos → Alternativas; o exemplo tem 3 alternativas lado a lado e "Gerar planta" | Verificado (exemplo) |
| Leitura do terreno | Lote pelo mapa (450,3 m²), área edificável, TO e CA, **horas de sol por fachada** e carta solar para −27,6°. Lógica do hemisfério sul correta (frente N 38° O: 8,8 h no inverno) | Verificado |
| Recomendações do terreno | As **4 fachadas dizem "pede brise"**, até os fundos com 1,5 h de sol no inverno; o texto contradiz os números | Inconsistência |

#### Verificação ao vivo da planta

Avisos com norma citada: "Sala: abertura de ventilação de 5,2% do piso; a NBR 15575 pede 8%
(item 11.3, Tabela 16)" e "Mancha: sem porta nem passagem". **Bug:** num projeto em **São Paulo**, o painel cita
o **Código de Obras de Florianópolis** (LC 786/2026).

#### Reforma

Fases Existente / Obra / Proposta, legenda com contagem (10 existentes) e convenção de cores
(cinza, amarelo, vermelho, roxo para "regularizar"). "Começar a proposta" congela o levantamento como versão;
apagar uma parede existente a marca **"A demolir"** (tracejada). Verificado.
**Bug:** o "Desfazer" do aviso não reverteu a demolição; foi preciso voltar "Fase demolida" para Nenhum no painel.

#### Financeiro

Telas: Visão geral, Propostas (etapas × horas → preço, custo e margem; aprovação pelo portal), Contratos,
Lançamentos, Contas, Extrato, Impostos (provisão pela alíquota do contador) e Relatório mensal com
**planilha XLSX + ZIP de comprovantes para o contador**. Não criei proposta, para não gastar a cota grátis.

No exemplo (contrato de R$ 38.000, 4 etapas, 4 parcelas por gatilho), dois **erros de cálculo**:
- **Margem projetada inflada:** o custo de horas "No fim" (R$ 3.303) é igual ao "Até agora". As etapas legal e
  executiva, ainda não começadas (R$ 4.620 orçados), ficam fora da conta, e a margem projetada sai em 79,9%,
  acima da orçada (67,7%).
- **Radar contraditório:** o radar diz "em dia, nenhuma etapa pedindo atenção" com o Estudo preliminar a
  R$ 3.915 contra R$ 1.915 orçados (104% acima).

#### Compartilhar e publicar (até antes do envio)

- Acesso ao projeto: equipe com papel e um **link só para ver** a planta, sem conta (mede e comenta, não vê o
  financeiro, revogável). Não gerei o link.
- Publicar apresentação: link para o cliente comentar cada página e aprovar, no celular ou no computador;
  3 publicações grátis. Não publiquei.

#### Não testado nesta rodada

- **Versão mobile:** a janela do Chrome estava maximizada e não redimensionou. O app recusa ser carregado em
  iframe (proteção contra clickjacking, um ponto positivo).
- **Escada:** o comando exige um ambiente e um segundo pavimento.
- **Biblioteca:** importação de famílias.
- **Portal do cliente:** pelo lado do cliente, porque exigiria publicar.

#### Estado deixado na conta

O projeto "Teste auditoria Traço" ficou com: paredes, Sala, porta, janela, linha de corte A, marca de elevação 1,
telhado, proposta de reforma iniciada (sem demolições) e a documentação regenerada (R01). Também ficou o estudo
"Programa da planta (Residência)" em Estudos. Excluir os dois é irreversível e fica a critério do usuário.

## Planos (site e app, 2026-11-08)

Grátis (3 projetos, sem cartão) · **Autônomo R$ 67/mês** (1 pessoa, 3 projetos ativos, 10 GB) ·
**Escritório R$ 97/mês** (até 5 pessoas, ilimitado, 200 GB, gestão completa) · **Estúdio R$ 147/mês**
(até 12 + R$ 29/pessoa extra, 500 GB, permissão por pessoa). Pagamento por Pix ou cartão.
Oferta de fundador: 10% por 12 meses até 15/12.

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
7. **Cortes e fachadas não são vistas vivas:** a linha de corte do usuário não define o corte gerado, não há vista
   de corte editável e as pranchas trazem cortes esquemáticos. Vista de corte real, cortada pelo modelo e com cotas
   e níveis, é uma vantagem direta (Fase 4).
8. **IA de render e de layout fora do ar em produção**, e cerca de 250 ferramentas com nome de Revit, várias em
   "versão mínima". O Traço deve mostrar só o que funciona, com o status de cada item.
9. **Erros de cálculo no financeiro** (margem projetada e radar) e **norma do município errado** nos avisos:
   regras e contas testadas automaticamente são diferencial de confiança.

**O que o Croquii faz bem e o Traço ainda não tem:** telhado automático por contorno, fluxo mancha → paredes,
leitura de terreno com insolação, fases de reforma, cálculo de carga térmica, exportação IFC/glTF/gbXML no
navegador e o portal de aprovação do cliente. Entram como requisitos nas Fases 3 a 5 e 9.

**Não verificado:** versão mobile, escada, importação na Biblioteca, portal do lado do cliente, exportação
efetiva (não baixamos arquivos) e qualidade das imagens com IA (serviço desligado).
