import type { Project } from '@traco/core';
import { api, ApiError } from '../api/client.ts';
import { useEditor } from './store.ts';

/**
 * Salvamento automático com:
 *  - debounce após cada alteração;
 *  - rascunho local (localStorage) para recuperação após queda/fechamento;
 *  - concorrência otimista (409 → estado de conflito, nada é sobrescrito);
 *  - nova tentativa com backoff quando o servidor está fora.
 */
const SAVE_DELAY = 1200;
const DRAFT_DELAY = 300;

export interface Draft {
  baseRevision: number;
  savedAt: number;
  project: Project;
}

const draftKey = (id: string) => `traco:draft:${id}`;

export const readDraft = (id: string): Draft | null => {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};

export const clearDraft = (id: string) => {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* armazenamento indisponível: nada a limpar */
  }
};

const writeDraft = (p: Project, baseRevision: number) => {
  try {
    localStorage.setItem(draftKey(p.id), JSON.stringify({ baseRevision, savedAt: Date.now(), project: p } satisfies Draft));
  } catch {
    useEditor.getState().message('Não foi possível gravar o rascunho local (armazenamento cheio ou bloqueado).', 'error');
  }
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let draftTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let retryDelay = 2000;

export const saveNow = async (): Promise<void> => {
  const st = useEditor.getState();
  const p = st.project;
  if (!p || inflight) return;
  if (st.saveState === 'conflict') return;
  if (saveTimer) clearTimeout(saveTimer);
  inflight = true;
  const tick = st.historyTick;
  const label = st.history.undoLabel ?? 'Alteração';
  st.setSaveState('saving');
  try {
    const saved = await api.saveProject(p, st.savedRevision, label);
    const now = useEditor.getState();
    now.markSaved(saved.revision);
    retryDelay = 2000;
    if (now.historyTick === tick) {
      now.setSaveState('saved');
      clearDraft(p.id);
    } else {
      // houve edição durante o envio: salva de novo
      now.setSaveState('dirty');
      schedule();
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(String(e), 500, 'unknown');
    const s = useEditor.getState();
    if (err.status === 409) {
      s.setSaveState('conflict', err.message);
    } else if (err.isNetwork) {
      s.setSaveState('offline', 'Sem conexão — as alterações estão no rascunho local e serão enviadas quando o servidor voltar.');
      saveTimer = setTimeout(() => void saveNow(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    } else {
      s.setSaveState('error', err.message);
    }
  } finally {
    inflight = false;
  }
};

const schedule = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY);
};

/** Liga o autosave ao store. Retorna função para desligar. */
export const startAutosave = (): (() => void) => {
  const unsub = useEditor.subscribe((s, prev) => {
    // só reage a edições do modelo (commit/undo/redo); recarregamentos chegam como 'saved'
    if (!s.project || s.historyTick === prev.historyTick) return;
    if (s.saveState === 'saved') return;
    if (draftTimer) clearTimeout(draftTimer);
    const proj = s.project;
    const base = s.savedRevision;
    draftTimer = setTimeout(() => writeDraft(proj, base), DRAFT_DELAY);
    if (s.saveState === 'dirty' || s.saveState === 'error') schedule();
  });
  const beforeUnload = (ev: BeforeUnloadEvent) => {
    const st = useEditor.getState().saveState;
    if (st !== 'saved') {
      ev.preventDefault();
      ev.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    unsub();
    window.removeEventListener('beforeunload', beforeUnload);
    if (saveTimer) clearTimeout(saveTimer);
    if (draftTimer) clearTimeout(draftTimer);
  };
};

/** Conflito: descarta alterações locais e carrega a versão do servidor. */
export const reloadFromServer = async () => {
  const p = useEditor.getState().project;
  if (!p) return;
  const fresh = await api.getProject(p.id);
  clearDraft(p.id);
  useEditor.getState().replaceProject(fresh);
  useEditor.getState().message(`Versão do servidor carregada (revisão ${fresh.revision}).`, 'success');
};

/** Conflito: grava a versão local como nova revisão. A versão do servidor continua no histórico. */
export const overwriteServer = async () => {
  const st = useEditor.getState();
  const p = st.project;
  if (!p) return;
  const fresh = await api.getProject(p.id);
  useEditor.setState({ savedRevision: fresh.revision, saveState: 'dirty', saveError: null });
  await saveNow();
};
