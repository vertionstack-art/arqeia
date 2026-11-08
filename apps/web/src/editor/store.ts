import { create } from 'zustand';
import {
  type BBox,
  type Change,
  type Entity,
  type Id,
  type Project,
  type SnapSettings,
  type Vec2,
  History,
  SpatialIndex,
  applyChanges,
  defaultSnapSettings,
  entityBBox,
  entityDistance,
  inflateBox,
} from '@traco/core';

export type ToolId =
  | 'select'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'wall'
  | 'dimension'
  | 'text'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'scale'
  | 'mirror'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'measure'
  | 'area';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'offline' | 'conflict';

export interface View {
  /** Centro da vista em coordenadas de projeto (mm). */
  cx: number;
  cy: number;
  /** Pixels de tela por milímetro. */
  zoom: number;
}

export interface Message {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface EditorState {
  project: Project | null;
  history: History;
  historyTick: number;
  savedRevision: number;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  selection: Id[];
  hoverId: Id | null;
  levelId: Id;
  layerId: Id;
  toolId: ToolId;
  snap: SnapSettings;
  ortho: boolean;
  gridVisible: boolean;
  view: View;
  messages: Message[];
  wallDefaults: { thickness: number; height: number };
  textHeight: number;
  offsetDistance: number | null;

  load(p: Project): void;
  unload(): void;
  commit(label: string, changes: Change[]): void;
  undo(): void;
  redo(): void;
  setSelection(ids: Id[]): void;
  setHover(id: Id | null): void;
  setTool(t: ToolId): void;
  setView(v: View): void;
  setLevel(id: Id): void;
  setLayer(id: Id): void;
  setSnap(patch: Partial<SnapSettings>): void;
  toggleOrtho(): void;
  toggleGrid(): void;
  message(text: string, kind?: Message['kind']): void;
  setSaveState(s: SaveState, error?: string | null): void;
  markSaved(revision: number): void;
  replaceProject(p: Project, keepHistory?: boolean): void;
  set(patch: Partial<EditorState>): void;
}

/** Índice espacial fora do estado reativo: é mutável e atualizado em cada commit. */
export const spatial = new SpatialIndex(2000);

const reindexAll = (p: Project) => {
  spatial.clear();
  for (const e of Object.values(p.entities)) spatial.insert(e.id, entityBBox(e));
};

const reindexChanges = (p: Project, changes: Change[]) => {
  for (const c of changes) {
    if (c.collection !== 'entities') continue;
    const e = p.entities[c.id];
    if (e) spatial.insert(e.id, entityBBox(e));
    else spatial.remove(c.id);
  }
};

let msgId = 0;

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  history: new History(),
  historyTick: 0,
  savedRevision: 0,
  saveState: 'saved',
  saveError: null,
  lastSavedAt: null,
  selection: [],
  hoverId: null,
  levelId: '',
  layerId: '',
  toolId: 'select',
  snap: defaultSnapSettings(),
  ortho: false,
  gridVisible: true,
  view: { cx: 0, cy: 0, zoom: 0.05 },
  messages: [],
  wallDefaults: { thickness: 150, height: 2800 },
  textHeight: 250,
  offsetDistance: null,

  load(p) {
    reindexAll(p);
    const layer = p.layers.find((l) => l.name === '0') ?? p.layers[0];
    set({
      project: p,
      history: new History(),
      historyTick: 0,
      savedRevision: p.revision,
      saveState: 'saved',
      saveError: null,
      selection: [],
      hoverId: null,
      levelId: p.levels[0].id,
      layerId: layer.id,
      toolId: 'select',
      snap: defaultSnapSettings(p.settings.gridSize),
      messages: [],
    });
  },

  unload() {
    spatial.clear();
    set({ project: null, selection: [], hoverId: null });
  },

  commit(label, changes) {
    const p = get().project;
    if (!p || changes.length === 0) return;
    const next = applyChanges(p, changes);
    reindexChanges(next, changes);
    get().history.record({ label, changes, at: Date.now() });
    const alive = get().selection.filter((id) => next.entities[id]);
    set((s) => ({ project: next, historyTick: s.historyTick + 1, saveState: s.saveState === 'conflict' ? 'conflict' : 'dirty', selection: alive }));
  },

  undo() {
    const p = get().project;
    if (!p) return;
    const r = get().history.undo(p);
    if (!r) return get().message('Nada para desfazer.');
    reindexChanges(r.project, r.tx.changes);
    set((s) => ({ project: r.project, historyTick: s.historyTick + 1, saveState: 'dirty', selection: s.selection.filter((id) => r.project.entities[id]) }));
    get().message(`Desfeito: ${r.tx.label}`);
  },

  redo() {
    const p = get().project;
    if (!p) return;
    const r = get().history.redo(p);
    if (!r) return get().message('Nada para refazer.');
    reindexChanges(r.project, r.tx.changes);
    set((s) => ({ project: r.project, historyTick: s.historyTick + 1, saveState: 'dirty', selection: s.selection.filter((id) => r.project.entities[id]) }));
    get().message(`Refeito: ${r.tx.label}`);
  },

  setSelection: (ids) => set({ selection: ids }),
  setHover: (id) => (get().hoverId === id ? undefined : set({ hoverId: id })),
  setTool: (t) => set({ toolId: t }),
  setView: (v) => set({ view: v }),
  setLevel: (id) => set({ levelId: id, selection: [] }),
  setLayer: (id) => set({ layerId: id }),
  setSnap: (patch) => set((s) => ({ snap: { ...s.snap, ...patch } })),
  toggleOrtho: () => set((s) => ({ ortho: !s.ortho })),
  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
  message: (text, kind = 'info') => set((s) => ({ messages: [...s.messages.slice(-49), { id: ++msgId, text, kind }] })),
  setSaveState: (saveState, error = null) => set({ saveState, saveError: error }),
  markSaved: (revision) =>
    set((s) => ({
      project: s.project ? { ...s.project, revision } : s.project,
      savedRevision: revision,
      lastSavedAt: Date.now(),
      saveError: null,
    })),
  replaceProject(p, keepHistory = false) {
    reindexAll(p);
    set((s) => ({
      project: p,
      savedRevision: p.revision,
      saveState: 'saved',
      saveError: null,
      history: keepHistory ? s.history : new History(),
      historyTick: s.historyTick + 1,
      selection: [],
      levelId: p.levels.some((l) => l.id === s.levelId) ? s.levelId : p.levels[0].id,
      layerId: p.layers.some((l) => l.id === s.layerId) ? s.layerId : p.layers[0].id,
    }));
  },
  set: (patch) => set(patch),
}));

// ---------------------------------------------------------------------------
// Consultas derivadas
// ---------------------------------------------------------------------------

/** Entidades do pavimento ativo em layers visíveis, dentro da caixa. */
export const visibleEntitiesIn = (box: BBox): Entity[] => {
  const { project, levelId } = useEditor.getState();
  if (!project) return [];
  const visible = new Set(project.layers.filter((l) => l.visible).map((l) => l.id));
  const out: Entity[] = [];
  for (const id of spatial.query(box)) {
    const e = project.entities[id];
    if (e && e.levelId === levelId && visible.has(e.layerId)) out.push(e);
  }
  return out;
};

/** Igual a visibleEntitiesIn, mas exclui layers bloqueados (para seleção/edição). */
export const editableEntitiesIn = (box: BBox): Entity[] => {
  const { project } = useEditor.getState();
  if (!project) return [];
  const locked = new Set(project.layers.filter((l) => l.locked).map((l) => l.id));
  return visibleEntitiesIn(box).filter((e) => !locked.has(e.layerId));
};

export const pickEntity = (p: Vec2, tolerance: number): Entity | null => {
  const box = inflateBox({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, tolerance);
  let best: Entity | null = null;
  let bestD = tolerance;
  for (const e of editableEntitiesIn(box)) {
    const d = entityDistance(e, p);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

export const isLayerLocked = (layerId: Id): boolean => !!useEditor.getState().project?.layers.find((l) => l.id === layerId)?.locked;
