import type { Entity, Id, Layer, Level, Project } from './model/types.ts';

/**
 * Alteração atômica e reversível. `before = null` significa criação,
 * `after = null` significa remoção. Toda edição do modelo passa por aqui,
 * o que dá desfazer/refazer, autosave incremental e trilha de auditoria.
 */
export type Change =
  | { collection: 'entities'; id: Id; before: Entity | null; after: Entity | null }
  | { collection: 'layers'; id: Id; before: Layer | null; after: Layer | null }
  | { collection: 'levels'; id: Id; before: Level | null; after: Level | null };

export interface Transaction {
  label: string;
  changes: Change[];
  at: number;
}

const applyList = <T extends { id: Id }>(list: T[], id: Id, value: T | null, insertAt?: number): T[] => {
  const idx = list.findIndex((x) => x.id === id);
  if (value === null) return idx === -1 ? list : list.filter((x) => x.id !== id);
  if (idx === -1) {
    const copy = [...list];
    copy.splice(insertAt ?? copy.length, 0, value);
    return copy;
  }
  const copy = [...list];
  copy[idx] = value;
  return copy;
};

/** Aplica alterações de forma imutável (retorna novo projeto). */
export const applyChanges = (p: Project, changes: Change[], direction: 'forward' | 'backward' = 'forward'): Project => {
  let entities = p.entities;
  let layers = p.layers;
  let levels = p.levels;
  const ordered = direction === 'forward' ? changes : [...changes].reverse();
  for (const c of ordered) {
    const value = direction === 'forward' ? c.after : c.before;
    if (c.collection === 'entities') {
      if (entities === p.entities) entities = { ...entities };
      if (value === null) delete entities[c.id];
      else entities[c.id] = value as Entity;
    } else if (c.collection === 'layers') {
      layers = applyList(layers, c.id, value as Layer | null);
    } else {
      levels = applyList(levels, c.id, value as Level | null);
    }
  }
  return { ...p, entities, layers, levels };
};

export class History {
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];

  constructor(private readonly limit = 500) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }
  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }
  get entries(): readonly Transaction[] {
    return this.undoStack;
  }

  /** Registra uma transação já aplicada. Ignora transações vazias. */
  record(tx: Transaction): void {
    if (tx.changes.length === 0) return;
    this.undoStack.push(tx);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(p: Project): { project: Project; tx: Transaction } | null {
    const tx = this.undoStack.pop();
    if (!tx) return null;
    this.redoStack.push(tx);
    return { project: applyChanges(p, tx.changes, 'backward'), tx };
  }

  redo(p: Project): { project: Project; tx: Transaction } | null {
    const tx = this.redoStack.pop();
    if (!tx) return null;
    this.undoStack.push(tx);
    return { project: applyChanges(p, tx.changes, 'forward'), tx };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// Helpers para montar alterações
export const addEntity = (e: Entity): Change => ({ collection: 'entities', id: e.id, before: null, after: e });
export const removeEntity = (e: Entity): Change => ({ collection: 'entities', id: e.id, before: e, after: null });
export const updateEntity = (before: Entity, after: Entity): Change => ({ collection: 'entities', id: before.id, before, after });
