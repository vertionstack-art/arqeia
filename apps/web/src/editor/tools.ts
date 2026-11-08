import {
  type Change,
  type Entity,
  type EntityDraft,
  type Id,
  type LengthUnit,
  type Vec2,
  add,
  addEntity,
  angleOf,
  cross,
  deg,
  dist,
  explodeEntity,
  extendEntity,
  formatArea,
  formatLength,
  fromPolar,
  mirrorEntity,
  moveEntity,
  mul,
  norm,
  offsetEntity,
  parseLength,
  parsePointInput,
  polygonArea,
  polylineLength,
  rad,
  removeEntity,
  rotateEntity,
  scaleEntity,
  sub,
  trimEntity,
  updateEntity,
  newId,
} from '@traco/core';
import type { ToolId } from './store.ts';

export interface ToolCtx {
  units: LengthUnit;
  levelId: Id;
  /** Layer onde a ferramenta deve criar (pode ser um layer padrão da categoria). */
  layerFor(kind: 'default' | 'wall' | 'dimension' | 'text'): Id | null;
  selection(): Entity[];
  commit(label: string, changes: Change[]): void;
  setSelection(ids: Id[]): void;
  message(text: string, kind?: 'info' | 'error' | 'success'): void;
  pick(p: Vec2): Entity | null;
  /** Entidades editáveis visíveis cuja caixa toca a caixa dada (null = todas). */
  visible(around: Entity | null): Entity[];
  wallDefaults: { thickness: number; height: number };
  textHeight: number;
  getOffset(): number | null;
  setOffset(d: number): void;
}

export interface Preview {
  drafts: EntityDraft[];
  guides: [Vec2, Vec2][];
  highlight: Id[];
}

const emptyPreview = (): Preview => ({ drafts: [], guides: [], highlight: [] });

export abstract class Tool {
  abstract readonly id: ToolId;
  abstract readonly label: string;
  protected cursor: Vec2 | null = null;
  /** Quando true, cliques selecionam entidades (snap desligado). */
  pickMode = false;
  /** Quando true, a linha de comando recebe texto livre (não coordenadas). */
  textMode = false;
  /** Opções de uma letra aceitas pela ferramenta (têm prioridade sobre apelidos de comando). */
  options: string[] = [];

  abstract get prompt(): string;
  /** Ponto base para modo ortogonal, entrada relativa e snaps perpendicular/tangente. */
  get base(): Vec2 | null {
    return null;
  }
  abstract onPoint(p: Vec2, ctx: ToolCtx): void;
  onMove(p: Vec2): void {
    this.cursor = p;
  }
  /** Retorna true se a ferramenta terminou e o editor deve voltar à seleção. */
  onEnter(_ctx: ToolCtx): boolean {
    return true;
  }
  onEscape(_ctx: ToolCtx): boolean {
    return true;
  }
  preview(): Preview {
    return emptyPreview();
  }
  /** Interpreta entrada de teclado. Retorna false se não reconheceu. */
  onInput(text: string, ctx: ToolCtx): boolean {
    const r = parsePointInput(text, this.base, ctx.units);
    if (r.kind === 'error') {
      ctx.message(r.message, 'error');
      return true;
    }
    if (r.kind === 'point') {
      this.onPoint(r.point, ctx);
      return true;
    }
    const b = this.base;
    if (!b) {
      ctx.message('Informe um ponto (x,y) antes de usar distância direta.', 'error');
      return true;
    }
    const dir = this.cursor && dist(this.cursor, b) > 1e-6 ? norm(sub(this.cursor, b)) : { x: 1, y: 0 };
    this.onPoint(add(b, mul(dir, r.distance)), ctx);
    return true;
  }
}

const requireLayer = (ctx: ToolCtx, kind: Parameters<ToolCtx['layerFor']>[0]): Id | null => {
  const id = ctx.layerFor(kind);
  if (!id) ctx.message('O layer atual está bloqueado ou oculto. Escolha outro layer para desenhar.', 'error');
  return id;
};

const create = (ctx: ToolCtx, label: string, drafts: EntityDraft[]) => {
  const ents = drafts.map((d) => ({ ...d, id: newId('ent'), levelId: ctx.levelId }) as Entity);
  ctx.commit(label, ents.map(addEntity));
  return ents;
};

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

class ChainTool extends Tool {
  private start: Vec2 | null = null;
  constructor(
    readonly id: 'line' | 'wall',
    readonly label: string,
  ) {
    super();
  }
  get base() {
    return this.start;
  }
  get prompt() {
    return this.start ? 'Próximo ponto (Enter encerra a sequência)' : this.id === 'wall' ? 'Ponto inicial do eixo da parede' : 'Primeiro ponto da linha';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.start) {
      this.start = p;
      return;
    }
    if (dist(this.start, p) < 1e-6) return;
    const layerId = requireLayer(ctx, this.id === 'wall' ? 'wall' : 'default');
    if (!layerId) return;
    if (this.id === 'wall') create(ctx, 'Parede', [{ type: 'wall', layerId, a: this.start, b: p, ...ctx.wallDefaults }]);
    else create(ctx, 'Linha', [{ type: 'line', layerId, a: this.start, b: p }]);
    this.start = p;
  }
  onEnter() {
    if (this.start) {
      this.start = null;
      return false;
    }
    return true;
  }
  onEscape() {
    return this.onEnter();
  }
  previewWall: { thickness: number; height: number } = { thickness: 150, height: 2800 };
  preview(): Preview {
    if (!this.start || !this.cursor || dist(this.start, this.cursor) < 1e-6) return emptyPreview();
    const d: EntityDraft =
      this.id === 'wall'
        ? { type: 'wall', layerId: '', a: this.start, b: this.cursor, ...this.previewWall }
        : { type: 'line', layerId: '', a: this.start, b: this.cursor };
    return { drafts: [d], guides: [], highlight: [] };
  }
}

class PolylineTool extends Tool {
  readonly id = 'polyline';
  readonly label = 'Polilinha';
  options = ['c'];
  private pts: Vec2[] = [];
  closeTolerance = 1;
  get base() {
    return this.pts.at(-1) ?? null;
  }
  get prompt() {
    return this.pts.length === 0 ? 'Primeiro ponto' : 'Próximo ponto — Enter termina aberta, C fecha (ou clique no ponto inicial)';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (this.pts.length >= 3 && dist(p, this.pts[0]) <= this.closeTolerance) return this.finish(ctx, true);
    if (this.pts.length && dist(p, this.pts.at(-1)!) < 1e-6) return;
    this.pts.push(p);
  }
  private finish(ctx: ToolCtx, closed: boolean) {
    if (this.pts.length >= (closed ? 3 : 2)) {
      const layerId = requireLayer(ctx, 'default');
      if (layerId) create(ctx, closed ? 'Polilinha fechada' : 'Polilinha', [{ type: 'polyline', layerId, points: this.pts, closed }]);
    }
    this.pts = [];
  }
  onInput(text: string, ctx: ToolCtx) {
    if (text.trim().toLowerCase() === 'c') {
      this.finish(ctx, true);
      return true;
    }
    return super.onInput(text, ctx);
  }
  onEnter(ctx: ToolCtx) {
    const had = this.pts.length > 0;
    this.finish(ctx, false);
    return !had;
  }
  onEscape() {
    const had = this.pts.length > 0;
    this.pts = [];
    return !had;
  }
  preview(): Preview {
    if (!this.pts.length) return emptyPreview();
    const pts = this.cursor ? [...this.pts, this.cursor] : this.pts;
    return { drafts: pts.length >= 2 ? [{ type: 'polyline', layerId: '', points: pts, closed: false }] : [], guides: [], highlight: [] };
  }
}

class RectTool extends Tool {
  readonly id = 'rect';
  readonly label = 'Retângulo';
  private c1: Vec2 | null = null;
  get base() {
    return this.c1;
  }
  get prompt() {
    return this.c1 ? 'Canto oposto (ex.: @4,3 para 4 × 3)' : 'Primeiro canto';
  }
  private corners(a: Vec2, b: Vec2): Vec2[] {
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.c1) {
      this.c1 = p;
      return;
    }
    if (Math.abs(p.x - this.c1.x) < 1e-6 || Math.abs(p.y - this.c1.y) < 1e-6) return ctx.message('Retângulo com lado nulo.', 'error');
    const layerId = requireLayer(ctx, 'default');
    if (layerId) create(ctx, 'Retângulo', [{ type: 'polyline', layerId, points: this.corners(this.c1, p), closed: true }]);
    this.c1 = null;
  }
  onEscape() {
    const had = !!this.c1;
    this.c1 = null;
    return !had;
  }
  preview(): Preview {
    if (!this.c1 || !this.cursor) return emptyPreview();
    return { drafts: [{ type: 'polyline', layerId: '', points: this.corners(this.c1, this.cursor), closed: true }], guides: [], highlight: [] };
  }
}

class CircleTool extends Tool {
  readonly id = 'circle';
  readonly label = 'Círculo';
  private c: Vec2 | null = null;
  get base() {
    return this.c;
  }
  get prompt() {
    return this.c ? 'Raio (clique ou digite a medida)' : 'Centro do círculo';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.c) {
      this.c = p;
      return;
    }
    const r = dist(this.c, p);
    if (r < 1e-6) return;
    const layerId = requireLayer(ctx, 'default');
    if (layerId) create(ctx, 'Círculo', [{ type: 'circle', layerId, c: this.c, r }]);
    this.c = null;
  }
  onEscape() {
    const had = !!this.c;
    this.c = null;
    return !had;
  }
  preview(): Preview {
    if (!this.c || !this.cursor || dist(this.c, this.cursor) < 1e-6) return emptyPreview();
    return { drafts: [{ type: 'circle', layerId: '', c: this.c, r: dist(this.c, this.cursor) }], guides: [[this.c, this.cursor]], highlight: [] };
  }
}

class ArcTool extends Tool {
  readonly id = 'arc';
  readonly label = 'Arco';
  private c: Vec2 | null = null;
  private s: Vec2 | null = null;
  get base() {
    return this.s ? this.c : this.c;
  }
  get prompt() {
    if (!this.c) return 'Centro do arco';
    if (!this.s) return 'Ponto inicial (define o raio)';
    return 'Ponto final (sentido anti-horário) ou ângulo final em graus';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.c) {
      this.c = p;
      return;
    }
    if (!this.s) {
      if (dist(p, this.c) < 1e-6) return;
      this.s = p;
      return;
    }
    const r = dist(this.c, this.s);
    const start = angleOf(sub(this.s, this.c));
    const end = angleOf(sub(p, this.c));
    const layerId = requireLayer(ctx, 'default');
    if (layerId) create(ctx, 'Arco', [{ type: 'arc', layerId, c: this.c, r, start, end }]);
    this.c = this.s = null;
  }
  onInput(text: string, ctx: ToolCtx) {
    if (this.c && this.s && /^-?\d+([.,]\d+)?$/.test(text.trim())) {
      const a = rad(Number(text.trim().replace(',', '.')));
      this.onPoint(add(this.c, fromPolar(dist(this.c, this.s), a)), ctx);
      return true;
    }
    return super.onInput(text, ctx);
  }
  onEscape() {
    const had = !!this.c;
    this.c = this.s = null;
    return !had;
  }
  preview(): Preview {
    if (!this.c || !this.cursor) return emptyPreview();
    if (!this.s) return { drafts: [], guides: [[this.c, this.cursor]], highlight: [] };
    const r = dist(this.c, this.s);
    return {
      drafts: [{ type: 'arc', layerId: '', c: this.c, r, start: angleOf(sub(this.s, this.c)), end: angleOf(sub(this.cursor, this.c)) }],
      guides: [
        [this.c, this.s],
        [this.c, this.cursor],
      ],
      highlight: [],
    };
  }
}

class DimensionTool extends Tool {
  readonly id = 'dimension';
  readonly label = 'Cota alinhada';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  get base() {
    return this.b ?? this.a;
  }
  get prompt() {
    if (!this.a) return 'Primeiro ponto a cotar';
    if (!this.b) return 'Segundo ponto a cotar';
    return 'Posição da linha de cota';
  }
  private offsetFor(p: Vec2): number {
    const d = norm(sub(this.b!, this.a!));
    return cross(d, sub(p, this.a!));
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.a) {
      this.a = p;
      return;
    }
    if (!this.b) {
      if (dist(p, this.a) < 1e-6) return;
      this.b = p;
      return;
    }
    const layerId = requireLayer(ctx, 'dimension');
    if (layerId) create(ctx, 'Cota', [{ type: 'dimension', layerId, a: this.a, b: this.b, offset: this.offsetFor(p) }]);
    this.a = this.b = null;
  }
  onEscape() {
    const had = !!this.a;
    this.a = this.b = null;
    return !had;
  }
  preview(): Preview {
    if (!this.a || !this.cursor) return emptyPreview();
    if (!this.b) return { drafts: [], guides: [[this.a, this.cursor]], highlight: [] };
    return { drafts: [{ type: 'dimension', layerId: '', a: this.a, b: this.b, offset: this.offsetFor(this.cursor) }], guides: [], highlight: [] };
  }
}

class TextTool extends Tool {
  readonly id = 'text';
  readonly label = 'Texto';
  private p: Vec2 | null = null;
  get prompt() {
    return this.p ? 'Digite o texto e pressione Enter' : 'Ponto de inserção do texto';
  }
  onPoint(p: Vec2) {
    this.p = p;
    this.textMode = true;
  }
  onInput(text: string, ctx: ToolCtx) {
    if (!this.p) return super.onInput(text, ctx);
    if (!text.trim()) return true;
    const layerId = requireLayer(ctx, 'text');
    if (layerId) create(ctx, 'Texto', [{ type: 'text', layerId, p: this.p, text, height: ctx.textHeight, rotation: 0 }]);
    this.p = null;
    this.textMode = false;
    return true;
  }
  onEscape() {
    const had = !!this.p;
    this.p = null;
    this.textMode = false;
    return !had;
  }
}

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

/** Base para ferramentas que operam sobre a seleção (com fase de escolha se vazia). */
abstract class SelectionTool extends Tool {
  protected picked: Id[] = [];
  protected started = false;

  begin(ctx: ToolCtx) {
    this.picked = ctx.selection().map((e) => e.id);
    this.started = this.picked.length > 0;
    this.pickMode = !this.started;
  }
  protected abstract get stepPrompt(): string;
  get prompt() {
    return this.started ? this.stepPrompt : `Selecione objetos (${this.picked.length}) e pressione Enter`;
  }
  protected targets(ctx: ToolCtx): Entity[] {
    const all = new Map(ctx.selection().map((e) => [e.id, e]));
    return this.picked.map((id) => all.get(id)).filter((e): e is Entity => !!e);
  }
  protected handlePick(p: Vec2, ctx: ToolCtx) {
    const e = ctx.pick(p);
    if (!e) return;
    this.picked = this.picked.includes(e.id) ? this.picked.filter((x) => x !== e.id) : [...this.picked, e.id];
    ctx.setSelection(this.picked);
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.started) return this.handlePick(p, ctx);
    this.step(p, ctx);
  }
  protected abstract step(p: Vec2, ctx: ToolCtx): void;
  onEnter(ctx: ToolCtx) {
    if (!this.started) {
      if (this.picked.length === 0) return true;
      this.started = true;
      this.pickMode = false;
      return false;
    }
    return this.enterStep(ctx);
  }
  protected enterStep(_ctx: ToolCtx): boolean {
    return true;
  }
  preview(): Preview {
    return { ...emptyPreview(), highlight: this.picked };
  }
}

class MoveCopyTool extends SelectionTool {
  private from: Vec2 | null = null;
  private cache: Entity[] = [];
  constructor(
    readonly id: 'move' | 'copy',
    readonly label: string,
  ) {
    super();
  }
  get base() {
    return this.from;
  }
  protected get stepPrompt() {
    return this.from ? (this.id === 'copy' ? 'Destino da cópia (Enter encerra)' : 'Ponto de destino') : 'Ponto base';
  }
  protected step(p: Vec2, ctx: ToolCtx) {
    if (!this.from) {
      this.from = p;
      this.cache = this.targets(ctx);
      return;
    }
    const d = sub(p, this.from);
    const ents = this.targets(ctx);
    if (this.id === 'move') {
      ctx.commit(`Mover ${ents.length} objeto(s)`, ents.map((e) => updateEntity(e, moveEntity(e, d))));
      this.from = null;
    } else {
      const copies = ents.map((e) => ({ ...moveEntity(e, d), id: newId('ent') }));
      ctx.commit(`Copiar ${ents.length} objeto(s)`, copies.map(addEntity));
    }
  }
  onEnter(ctx: ToolCtx) {
    if (this.started && this.from) return true;
    return super.onEnter(ctx);
  }
  preview(): Preview {
    const pv = super.preview();
    if (!this.from || !this.cursor) return pv;
    const d = sub(this.cursor, this.from);
    return { ...pv, drafts: this.cache.map((e) => moveEntity(e, d)), guides: [[this.from, this.cursor]] };
  }
}

class RotateTool extends SelectionTool {
  readonly id = 'rotate';
  readonly label = 'Rotacionar';
  private c: Vec2 | null = null;
  private cache: Entity[] = [];
  get base() {
    return this.c;
  }
  protected get stepPrompt() {
    return this.c ? 'Ângulo em graus (ou clique para definir a direção)' : 'Ponto base da rotação';
  }
  protected step(p: Vec2, ctx: ToolCtx) {
    if (!this.c) {
      this.c = p;
      this.cache = this.targets(ctx);
      return;
    }
    this.apply(angleOf(sub(p, this.c)), ctx);
  }
  private apply(a: number, ctx: ToolCtx) {
    const ents = this.targets(ctx);
    ctx.commit(`Rotacionar ${deg(a).toFixed(2)}°`, ents.map((e) => updateEntity(e, rotateEntity(e, this.c!, a))));
    this.c = null;
    this.done = true;
  }
  done = false;
  onInput(text: string, ctx: ToolCtx) {
    if (this.started && this.c && /^-?\d+([.,]\d+)?$/.test(text.trim())) {
      this.apply(rad(Number(text.trim().replace(',', '.'))), ctx);
      return true;
    }
    return super.onInput(text, ctx);
  }
  preview(): Preview {
    const pv = super.preview();
    if (!this.c || !this.cursor) return pv;
    const a = angleOf(sub(this.cursor, this.c));
    return { ...pv, drafts: this.cache.map((e) => rotateEntity(e, this.c!, a)), guides: [[this.c, this.cursor]] };
  }
}

class ScaleTool extends SelectionTool {
  readonly id = 'scale';
  readonly label = 'Escalonar';
  private c: Vec2 | null = null;
  private ref: Vec2 | null = null;
  private cache: Entity[] = [];
  done = false;
  get base() {
    return this.c;
  }
  protected get stepPrompt() {
    if (!this.c) return 'Ponto base da escala';
    if (!this.ref) return 'Fator de escala (ex.: 2 ou 0.5) ou ponto de referência';
    return 'Novo ponto (fator = nova distância ÷ distância de referência)';
  }
  protected step(p: Vec2, ctx: ToolCtx) {
    if (!this.c) {
      this.c = p;
      this.cache = this.targets(ctx);
      return;
    }
    if (!this.ref) {
      if (dist(p, this.c) < 1e-6) return;
      this.ref = p;
      return;
    }
    this.apply(dist(this.c, p) / dist(this.c, this.ref), ctx);
  }
  private apply(f: number, ctx: ToolCtx) {
    if (!(f > 0) || !Number.isFinite(f)) return ctx.message('Fator de escala deve ser maior que zero.', 'error');
    const ents = this.targets(ctx);
    ctx.commit(`Escalonar ×${f.toFixed(4)}`, ents.map((e) => updateEntity(e, scaleEntity(e, this.c!, f))));
    if (ents.some((e) => e.type === 'wall')) ctx.message('Paredes: espessura e altura foram mantidas (parâmetros construtivos).');
    this.c = this.ref = null;
    this.done = true;
  }
  onInput(text: string, ctx: ToolCtx) {
    if (this.started && this.c && !this.ref && /^\d+([.,]\d+)?$/.test(text.trim())) {
      this.apply(Number(text.trim().replace(',', '.')), ctx);
      return true;
    }
    return super.onInput(text, ctx);
  }
  preview(): Preview {
    const pv = super.preview();
    if (!this.c || !this.ref || !this.cursor) return pv;
    const f = dist(this.c, this.cursor) / dist(this.c, this.ref);
    if (!(f > 0)) return pv;
    return { ...pv, drafts: this.cache.map((e) => scaleEntity(e, this.c!, f)), guides: [[this.c, this.cursor]] };
  }
}

class MirrorTool extends SelectionTool {
  readonly id = 'mirror';
  readonly label = 'Espelhar';
  options = ['a'];
  private a: Vec2 | null = null;
  private cache: Entity[] = [];
  private eraseSource = false;
  done = false;
  get base() {
    return this.a;
  }
  protected get stepPrompt() {
    const keep = this.eraseSource ? 'apagando originais' : 'mantendo originais';
    return this.a ? `Segundo ponto do eixo (${keep}; digite A para alternar)` : `Primeiro ponto do eixo de espelhamento (${keep})`;
  }
  protected step(p: Vec2, ctx: ToolCtx) {
    if (!this.a) {
      this.a = p;
      this.cache = this.targets(ctx);
      return;
    }
    if (dist(p, this.a) < 1e-6) return;
    const ents = this.targets(ctx);
    const changes: Change[] = this.eraseSource
      ? ents.map((e) => updateEntity(e, mirrorEntity(e, this.a!, p)))
      : ents.map((e) => addEntity({ ...mirrorEntity(e, this.a!, p), id: newId('ent') }));
    ctx.commit(`Espelhar ${ents.length} objeto(s)`, changes);
    this.a = null;
    this.done = true;
  }
  onInput(text: string, ctx: ToolCtx) {
    if (this.started && text.trim().toLowerCase() === 'a') {
      this.eraseSource = !this.eraseSource;
      return true;
    }
    return super.onInput(text, ctx);
  }
  preview(): Preview {
    const pv = super.preview();
    if (!this.a || !this.cursor || dist(this.a, this.cursor) < 1e-6) return pv;
    return { ...pv, drafts: this.cache.map((e) => mirrorEntity(e, this.a!, this.cursor!)), guides: [[this.a, this.cursor]] };
  }
}

class OffsetTool extends Tool {
  readonly id = 'offset';
  readonly label = 'Deslocamento (offset)';
  private target: Entity | null = null;
  private distance: number | null = null;
  begin(ctx: ToolCtx) {
    this.distance = ctx.getOffset();
    this.pickMode = this.distance !== null;
  }
  get prompt() {
    if (this.distance === null) return 'Distância do deslocamento';
    if (!this.target) return `Objeto a deslocar (distância ${this.distance.toFixed(0)} mm — digite outra para trocar)`;
    return 'Clique no lado do deslocamento';
  }
  onInput(text: string, ctx: ToolCtx) {
    const d = parseLength(text, ctx.units);
    if (d === null || !(d > 0)) {
      ctx.message('Informe uma distância positiva (ex.: 0.15 ou 15cm).', 'error');
      return true;
    }
    this.distance = d;
    ctx.setOffset(d);
    this.target = null;
    this.pickMode = true;
    return true;
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (this.distance === null) return ctx.message('Digite a distância primeiro.', 'error');
    if (!this.target) {
      const e = ctx.pick(p);
      if (!e) return;
      if (!['line', 'polyline', 'circle', 'arc'].includes(e.type)) return ctx.message('Offset suporta linha, polilinha, círculo e arco.', 'error');
      this.target = e;
      this.pickMode = false;
      return;
    }
    const r = offsetEntity(this.target, this.distance, p, newId('ent'));
    if (!r) ctx.message('Deslocamento resultaria em geometria degenerada.', 'error');
    else ctx.commit('Offset', [addEntity(r)]);
    this.target = null;
    this.pickMode = true;
  }
  onEnter() {
    return true;
  }
  onEscape() {
    if (this.target) {
      this.target = null;
      this.pickMode = true;
      return false;
    }
    return true;
  }
  preview(): Preview {
    if (!this.target || !this.cursor || this.distance === null) return emptyPreview();
    const r = offsetEntity(this.target, this.distance, this.cursor, 'preview');
    return { drafts: r ? [r] : [], guides: [], highlight: [this.target.id] };
  }
}

class TrimExtendTool extends Tool {
  pickMode = true;
  constructor(
    readonly id: 'trim' | 'extend',
    readonly label: string,
  ) {
    super();
  }
  get prompt() {
    return this.id === 'trim' ? 'Clique no trecho a remover (cortado pelas demais entidades)' : 'Clique perto da extremidade a estender';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    const e = ctx.pick(p);
    if (!e) return;
    const others = ctx.visible(this.id === 'trim' ? e : null);
    const r = this.id === 'trim' ? trimEntity(e, others, p, () => newId('ent')) : extendEntity(e, others, p);
    if (!r.ok) return ctx.message(r.reason, 'error');
    const changes: Change[] = [];
    const kept = new Set(r.replace.map((x) => x.id));
    if (!kept.has(e.id)) changes.push(removeEntity(e));
    for (const x of r.replace) changes.push(x.id === e.id ? updateEntity(e, x) : addEntity(x));
    ctx.commit(this.id === 'trim' ? 'Aparar' : 'Estender', changes);
  }
}

class MeasureTool extends Tool {
  readonly id = 'measure';
  readonly label = 'Medir distância';
  private a: Vec2 | null = null;
  get base() {
    return this.a;
  }
  get prompt() {
    return this.a ? 'Segundo ponto' : 'Primeiro ponto da medição';
  }
  onPoint(p: Vec2, ctx: ToolCtx) {
    if (!this.a) {
      this.a = p;
      return;
    }
    const d = sub(p, this.a);
    ctx.message(
      `Distância ${formatLength(dist(this.a, p), ctx.units)} · ΔX ${formatLength(d.x, ctx.units)} · ΔY ${formatLength(d.y, ctx.units)} · ângulo ${deg(angleOf(d)).toFixed(2)}°`,
      'success',
    );
    this.a = null;
  }
  onEscape() {
    const had = !!this.a;
    this.a = null;
    return !had;
  }
  preview(): Preview {
    return this.a && this.cursor ? { drafts: [], guides: [[this.a, this.cursor]], highlight: [] } : emptyPreview();
  }
}

class AreaTool extends Tool {
  readonly id = 'area';
  readonly label = 'Medir área';
  private pts: Vec2[] = [];
  get base() {
    return this.pts.at(-1) ?? null;
  }
  get prompt() {
    return this.pts.length < 3 ? `Vértices da área (${this.pts.length})` : `Próximo vértice ou Enter para calcular (${this.pts.length} pontos)`;
  }
  onPoint(p: Vec2) {
    this.pts.push(p);
  }
  onEnter(ctx: ToolCtx) {
    if (this.pts.length < 3) return true;
    ctx.message(`Área ${formatArea(polygonArea(this.pts), ctx.units)} · Perímetro ${formatLength(polylineLength(this.pts, true), ctx.units)}`, 'success');
    this.pts = [];
    return false;
  }
  onEscape() {
    const had = this.pts.length > 0;
    this.pts = [];
    return !had;
  }
  preview(): Preview {
    if (!this.pts.length) return emptyPreview();
    const pts = this.cursor ? [...this.pts, this.cursor] : this.pts;
    return { drafts: pts.length >= 2 ? [{ type: 'polyline', layerId: '', points: pts, closed: pts.length >= 3 }] : [], guides: [], highlight: [] };
  }
}

export const createTool = (id: ToolId, ctx: ToolCtx): Tool | null => {
  let t: Tool | null = null;
  switch (id) {
    case 'select':
      return null;
    case 'line':
      t = new ChainTool('line', 'Linha');
      break;
    case 'wall': {
      const w = new ChainTool('wall', 'Parede');
      w.previewWall = ctx.wallDefaults;
      t = w;
      break;
    }
    case 'polyline':
      t = new PolylineTool();
      break;
    case 'rect':
      t = new RectTool();
      break;
    case 'circle':
      t = new CircleTool();
      break;
    case 'arc':
      t = new ArcTool();
      break;
    case 'dimension':
      t = new DimensionTool();
      break;
    case 'text':
      t = new TextTool();
      break;
    case 'move':
      t = new MoveCopyTool('move', 'Mover');
      break;
    case 'copy':
      t = new MoveCopyTool('copy', 'Copiar');
      break;
    case 'rotate':
      t = new RotateTool();
      break;
    case 'scale':
      t = new ScaleTool();
      break;
    case 'mirror':
      t = new MirrorTool();
      break;
    case 'offset':
      t = new OffsetTool();
      break;
    case 'trim':
      t = new TrimExtendTool('trim', 'Aparar');
      break;
    case 'extend':
      t = new TrimExtendTool('extend', 'Estender');
      break;
    case 'measure':
      t = new MeasureTool();
      break;
    case 'area':
      t = new AreaTool();
      break;
  }
  if (t instanceof SelectionTool || t instanceof OffsetTool) t.begin(ctx);
  return t;
};

/** Ferramentas que terminam após uma operação única (voltam à seleção). */
export const isDone = (t: Tool): boolean => (t as { done?: boolean }).done === true;

/** Explodir: ação imediata sobre a seleção. */
export const explodeSelection = (ctx: ToolCtx): number => {
  const changes: Change[] = [];
  let count = 0;
  for (const e of ctx.selection()) {
    const parts = explodeEntity(e, () => newId('ent'));
    if (!parts) continue;
    count++;
    changes.push(removeEntity(e), ...parts.map(addEntity));
  }
  ctx.commit(`Explodir ${count} objeto(s)`, changes);
  return count;
};

/** Apelidos da linha de comando (estilo CAD). */
export const COMMAND_ALIASES: Record<string, ToolId | 'erase' | 'explode' | 'undo' | 'redo' | 'zoomext'> = {
  l: 'line',
  line: 'line',
  linha: 'line',
  pl: 'polyline',
  rec: 'rect',
  ret: 'rect',
  c: 'circle',
  a: 'arc',
  w: 'wall',
  par: 'wall',
  parede: 'wall',
  dim: 'dimension',
  di: 'measure',
  dist: 'measure',
  aa: 'area',
  area: 'area',
  t: 'text',
  dt: 'text',
  m: 'move',
  co: 'copy',
  cp: 'copy',
  ro: 'rotate',
  sc: 'scale',
  mi: 'mirror',
  o: 'offset',
  tr: 'trim',
  ex: 'extend',
  e: 'erase',
  x: 'explode',
  u: 'undo',
  z: 'zoomext',
  ze: 'zoomext',
  v: 'select',
};
