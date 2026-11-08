import {
  type Entity,
  type Id,
  type SnapPoint,
  type Vec2,
  applyOrtho,
  boxContainsBox,
  boxesIntersect,
  boxFromPoints,
  entityBBox,
  entityPrims,
  findSnap,
  inflateBox,
  intersectPrims,
  isEmptyBox,
  removeEntity,
  unionBox,
  emptyBox,
  entityDistance,
  type WallEntity,
} from '@traco/core';
import { type ToolId, editableEntitiesIn, pickEntity, useEditor, visibleEntitiesIn } from './store.ts';
import { type Tool, type ToolCtx, COMMAND_ALIASES, createTool, explodeSelection, isDone } from './tools.ts';
import { type Size, fitBox, toScreen, toWorld, zoomAt } from './viewport.ts';

const PICK_PX = 8;
const SNAP_PX = 12;
const DRAG_PX = 4;
const ALL = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

type Listener = () => void;

/**
 * Controlador de interação do editor 2D. Mantém a ferramenta ativa e o
 * estado efêmero (cursor, snap, caixa de seleção) fora do React para que
 * o movimento do mouse não provoque re-render de componentes.
 */
class EditorController {
  tool: Tool | null = null;
  size: Size = { w: 1, h: 1 };
  cursorWorld: Vec2 | null = null;
  snap: SnapPoint | null = null;
  box: { a: Vec2; b: Vec2 } | null = null;
  private downScreen: Vec2 | null = null;
  private downWorld: Vec2 | null = null;
  private panning: { start: Vec2; cx: number; cy: number } | null = null;
  spaceDown = false;
  private listeners = new Set<Listener>();
  private renderCb: (() => void) | null = null;
  private lastCommand: ToolId | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
    this.requestRender();
  }
  onRender(cb: () => void) {
    this.renderCb = cb;
  }
  requestRender() {
    this.renderCb?.();
  }

  get prompt(): string {
    if (this.tool) return `${this.tool.label}: ${this.tool.prompt}`;
    return 'Comando (ex.: L linha, W parede, M mover, TR aparar) ou clique para selecionar';
  }

  // ---------------------------------------------------------------- contexto
  ctx(): ToolCtx {
    const st = useEditor.getState();
    const p = st.project!;
    const usable = (id: Id | undefined) => {
      const l = p.layers.find((x) => x.id === id);
      return l && l.visible && !l.locked ? l.id : null;
    };
    const named: Record<string, string> = { wall: 'ARQ-PAREDES', dimension: 'ARQ-COTAS', text: 'ARQ-TEXTOS', slab: 'ARQ-PISOS', roof: 'ARQ-COBERTURA' };
    return {
      units: p.settings.units,
      levelId: st.levelId,
      layerFor: (kind) => {
        // se o usuário escolheu um layer diferente de "0", respeita a escolha
        const current = p.layers.find((l) => l.id === st.layerId);
        if (kind !== 'default' && current?.name === '0') {
          const n = usable(p.layers.find((l) => l.name === named[kind])?.id);
          if (n) return n;
        }
        return usable(st.layerId);
      },
      selection: () => {
        const s = useEditor.getState();
        return s.selection.map((id) => s.project!.entities[id]).filter((e): e is Entity => !!e);
      },
      commit: (label, changes) => useEditor.getState().commit(label, changes),
      setSelection: (ids) => useEditor.getState().setSelection(ids),
      message: (text, kind) => useEditor.getState().message(text, kind),
      pick: (pt) => pickEntity(pt, PICK_PX / useEditor.getState().view.zoom),
      visible: (around) => (around ? visibleEntitiesIn(inflateBox(entityBBox(around), 1)) : visibleEntitiesIn(ALL)),
      wallDefaults: st.wallDefaults,
      doorDefaults: st.doorDefaults,
      windowDefaults: st.windowDefaults,
      slabDefaults: st.slabDefaults,
      roofDefaults: st.roofDefaults,
      pickWall: (pt) => {
        const tol = PICK_PX / useEditor.getState().view.zoom;
        let best: WallEntity | null = null;
        let bestD = tol;
        for (const e of editableEntitiesIn(inflateBox({ minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y }, tol))) {
          if (e.type !== 'wall') continue;
          const d = entityDistance(e, pt);
          if (d <= bestD) {
            bestD = d;
            best = e;
          }
        }
        return best;
      },
      textHeight: st.textHeight,
      getOffset: () => useEditor.getState().offsetDistance,
      setOffset: (d) => useEditor.getState().set({ offsetDistance: d }),
    };
  }

  // ---------------------------------------------------------------- comandos
  setTool(id: ToolId) {
    const st = useEditor.getState();
    if (!st.project) return;
    this.tool = createTool(id, this.ctx());
    if (id !== 'select') this.lastCommand = id;
    st.setTool(id);
    this.box = null;
    this.emit();
  }

  /** Texto confirmado na linha de comando. */
  input(raw: string) {
    const text = raw.trim();
    const st = useEditor.getState();
    if (!st.project) return;
    if (!text) return this.enter();
    if (this.tool) {
      // um apelido de comando digitado durante uma ferramenta troca de ferramenta,
      // exceto quando a ferramenta espera texto livre ou opções de uma letra
      const alias = COMMAND_ALIASES[text.toLowerCase()];
      const isOption = this.tool.options.includes(text.toLowerCase());
      if (alias && !this.tool.textMode && !isOption && !/^[\d@.,<;-]/.test(text)) return this.runAlias(alias);
      this.tool.onInput(raw, this.ctx());
      this.afterToolStep();
      return;
    }
    const alias = COMMAND_ALIASES[text.toLowerCase()];
    if (!alias) return st.message(`Comando desconhecido: "${text}".`, 'error');
    this.runAlias(alias);
  }

  private runAlias(alias: (typeof COMMAND_ALIASES)[string]) {
    switch (alias) {
      case 'erase':
        return this.erase();
      case 'explode':
        return this.explode();
      case 'undo':
        return useEditor.getState().undo();
      case 'redo':
        return useEditor.getState().redo();
      case 'zoomext':
        return this.zoomExtents();
      default:
        return this.setTool(alias);
    }
  }

  enter() {
    if (!this.tool) {
      if (this.lastCommand) this.setTool(this.lastCommand); // Enter vazio repete o último comando (padrão CAD)
      return;
    }
    if (this.tool.onEnter(this.ctx())) this.setTool('select');
    else this.afterToolStep();
  }

  escape() {
    this.box = null;
    if (!this.tool) {
      useEditor.getState().setSelection([]);
      this.emit();
      return;
    }
    if (this.tool.onEscape(this.ctx())) this.setTool('select');
    else this.emit();
  }

  private afterToolStep() {
    if (this.tool && isDone(this.tool)) this.setTool('select');
    else this.emit();
  }

  erase() {
    const st = useEditor.getState();
    const ents = this.ctx().selection();
    if (!ents.length) return st.message('Nada selecionado para apagar.');
    st.commit(`Apagar ${ents.length} objeto(s)`, ents.map(removeEntity));
    st.setSelection([]);
  }

  explode() {
    const n = explodeSelection(this.ctx());
    useEditor.getState().message(n ? `${n} objeto(s) explodido(s).` : 'Selecione polilinhas ou paredes para explodir.', n ? 'success' : 'info');
  }

  selectAll() {
    const st = useEditor.getState();
    st.setSelection(editableEntitiesIn(ALL).map((e) => e.id));
  }

  zoomExtents() {
    const st = useEditor.getState();
    const ents = visibleEntitiesIn(ALL);
    let b = emptyBox();
    for (const e of ents) b = unionBox(b, entityBBox(e));
    if (isEmptyBox(b)) b = { minX: -5000, minY: -5000, maxX: 15000, maxY: 15000 };
    st.setView(fitBox(b, this.size));
  }

  // ---------------------------------------------------------------- ponteiro
  /** Converte posição de tela no ponto efetivo (snap > ortogonal > grade). */
  private resolvePoint(screen: Vec2): Vec2 {
    const st = useEditor.getState();
    const raw = toWorld(st.view, this.size, screen);
    this.snap = null;
    if (this.tool?.pickMode || !this.tool) return raw;
    const tol = SNAP_PX / st.view.zoom;
    const base = this.tool.base;
    const near = visibleEntitiesIn(inflateBox(boxFromPoints([raw]), tol));
    const objectSnap = findSnap({ cursor: raw, tolerance: tol, entities: near, base, settings: { ...st.snap, grid: false } });
    if (objectSnap) {
      this.snap = objectSnap;
      return objectSnap.p;
    }
    let p = st.ortho && base ? applyOrtho(base, raw) : raw;
    if (st.snap.enabled && st.snap.grid && st.snap.gridSize > 0) {
      const g = st.snap.gridSize;
      p = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
      if (st.ortho && base) p = applyOrtho(base, p);
      this.snap = { kind: 'grid', p };
    }
    return p;
  }

  pointerDown(screen: Vec2, button: number, shift: boolean) {
    const st = useEditor.getState();
    if (button === 1 || (button === 0 && this.spaceDown)) {
      this.panning = { start: screen, cx: st.view.cx, cy: st.view.cy };
      return;
    }
    if (button !== 0) return;
    this.downScreen = screen;
    this.downWorld = toWorld(st.view, this.size, screen);
    if (this.tool) {
      const p = this.resolvePoint(screen);
      if ('closeTolerance' in this.tool) (this.tool as { closeTolerance: number }).closeTolerance = SNAP_PX / st.view.zoom;
      this.tool.onPoint(p, this.ctx());
      this.afterToolStep();
      this.downScreen = null;
    }
    void shift;
  }

  pointerMove(screen: Vec2) {
    const st = useEditor.getState();
    if (this.panning) {
      const dx = (screen.x - this.panning.start.x) / st.view.zoom;
      const dy = (screen.y - this.panning.start.y) / st.view.zoom;
      st.setView({ ...st.view, cx: this.panning.cx - dx, cy: this.panning.cy + dy });
      return;
    }
    const p = this.resolvePoint(screen);
    this.cursorWorld = p;
    if (this.tool) {
      this.tool.onMove(p);
      // seleção visual do objeto sob o cursor quando a ferramenta escolhe objetos
      st.setHover(this.tool.pickMode ? (pickEntity(p, PICK_PX / st.view.zoom)?.id ?? null) : null);
    } else if (this.downScreen && this.downWorld) {
      const moved = Math.hypot(screen.x - this.downScreen.x, screen.y - this.downScreen.y);
      if (moved > DRAG_PX) this.box = { a: this.downWorld, b: p };
    } else {
      st.setHover(pickEntity(p, PICK_PX / st.view.zoom)?.id ?? null);
    }
    this.emit();
  }

  pointerUp(screen: Vec2, shift: boolean) {
    if (this.panning) {
      this.panning = null;
      return;
    }
    const st = useEditor.getState();
    if (!this.tool && this.downScreen) {
      if (this.box) {
        const b = boxFromPoints([this.box.a, this.box.b]);
        const crossing = this.box.b.x < this.box.a.x;
        const hits = editableEntitiesIn(b).filter((e) => (crossing ? touchesBox(e, b) : boxContainsBox(b, entityBBox(e))));
        const ids = hits.map((e) => e.id);
        st.setSelection(shift ? [...new Set([...st.selection, ...ids])] : ids);
      } else {
        const e = pickEntity(toWorld(st.view, this.size, screen), PICK_PX / st.view.zoom);
        if (e) {
          if (shift) st.setSelection(st.selection.includes(e.id) ? st.selection.filter((x) => x !== e.id) : [...st.selection, e.id]);
          else st.setSelection([e.id]);
        } else if (!shift) st.setSelection([]);
      }
    }
    this.box = null;
    this.downScreen = null;
    this.downWorld = null;
    this.emit();
  }

  wheel(screen: Vec2, deltaY: number) {
    const st = useEditor.getState();
    const factor = Math.pow(1.0015, -deltaY);
    st.setView(zoomAt(st.view, this.size, screen, factor));
    this.pointerMove(screen);
  }

  leave() {
    this.cursorWorld = null;
    this.snap = null;
    useEditor.getState().setHover(null);
    this.emit();
  }

  screenOf(p: Vec2): Vec2 {
    return toScreen(useEditor.getState().view, this.size, p);
  }
}

/** Seleção por cruzamento: a entidade toca o retângulo (não apenas a caixa envolvente). */
const touchesBox = (e: Entity, b: { minX: number; minY: number; maxX: number; maxY: number }): boolean => {
  const eb = entityBBox(e);
  if (!boxesIntersect(eb, b)) return false;
  if (boxContainsBox(b, eb)) return true;
  const prims = entityPrims(e);
  if (prims.length === 0) return true; // texto/cota: usa a caixa
  const c = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
  const edges = [0, 1, 2, 3].map((i) => ({ kind: 'seg' as const, a: c[i], b: c[(i + 1) % 4] }));
  for (const p of prims) {
    for (const ed of edges) if (intersectPrims(p, ed).length) return true;
    // primitiva inteiramente dentro já coberta por boxContainsBox de sua caixa
    if (p.kind === 'seg' && [p.a, p.b].some((q) => q.x >= b.minX && q.x <= b.maxX && q.y >= b.minY && q.y <= b.maxY)) return true;
  }
  return e.type === 'wall' && boxContainsBox(eb, b);
};

export const controller = new EditorController();
