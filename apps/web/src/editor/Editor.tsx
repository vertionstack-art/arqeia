import { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeft, Check, CloudOff, History as HistoryIcon, Loader2, Redo2, Undo2, AlertTriangle, Maximize, Box, FileText, Clapperboard, Map as MapIcon, Columns2 } from 'lucide-react';
import type { Project } from '@traco/core';
import { api, type RevisionSummary } from '../api/client.ts';
import { type ViewMode, useEditor } from './store.ts';
// o 3D (three.js) só é baixado quando a vista 3D é aberta
const Viewer3D = lazy(() => import('./Viewer3D.tsx').then((m) => ({ default: m.Viewer3D })));
import { controller } from './controller.ts';
import { Canvas } from './Canvas.tsx';
import { ToolRail } from './ToolRail.tsx';
import { CommandLine } from './CommandLine.tsx';
import { StatusBar } from './StatusBar.tsx';
import { LayersPanel, LevelsPanel, PropertiesPanel } from './Panels.tsx';
import { clearDraft, overwriteServer, readDraft, reloadFromServer, saveNow, startAutosave, type Draft } from './autosave.ts';
import { ThemeToggle } from '../ui/ThemeToggle.tsx';
import { Logo } from '../ui/Logo.tsx';
import { UserMenu } from '../ui/UserMenu.tsx';

const SaveBadge = () => {
  const state = useEditor((s) => s.saveState);
  const err = useEditor((s) => s.saveError);
  const map = {
    saved: { icon: <Check size={14} />, text: 'Salvo' },
    dirty: { icon: <span className="dot" />, text: 'Alterações pendentes' },
    saving: { icon: <Loader2 size={14} className="spin" />, text: 'Salvando…' },
    offline: { icon: <CloudOff size={14} />, text: 'Offline · rascunho local' },
    error: { icon: <AlertTriangle size={14} />, text: 'Erro ao salvar' },
    conflict: { icon: <AlertTriangle size={14} />, text: 'Conflito de revisão' },
  } as const;
  const m = map[state];
  return (
    <button className={`save-badge state-${state}`} onClick={() => void saveNow()} title={err ?? 'Ctrl+S salva agora'} aria-live="polite">
      {m.icon}
      <span>{m.text}</span>
    </button>
  );
};

const RevisionsPopover = ({ onClose }: { onClose: () => void }) => {
  const project = useEditor((s) => s.project!);
  const saveState = useEditor((s) => s.saveState);
  const [revs, setRevs] = useState<RevisionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.listRevisions(project.id).then(setRevs, (e: Error) => setErr(e.message));
  }, [project.id, project.revision]);
  const restore = async (rev: number) => {
    if (saveState !== 'saved') return setErr('Aguarde o salvamento das alterações atuais antes de restaurar.');
    if (!confirm(`Restaurar a revisão ${rev}? Ela será gravada como uma nova revisão; nada é apagado.`)) return;
    try {
      const p = await api.restoreRevision(project.id, rev);
      useEditor.getState().replaceProject(p);
      useEditor.getState().message(`Revisão ${rev} restaurada como revisão ${p.revision}.`, 'success');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="popover" role="dialog" aria-label="Histórico de revisões">
      <header>
        <strong>Revisões no servidor</strong>
        <button className="text-btn" onClick={onClose}>
          Fechar
        </button>
      </header>
      {err && <p className="note error">{err}</p>}
      {!revs && !err && <p className="note">Carregando…</p>}
      <ol className="rev-list">
        {revs?.map((r) => (
          <li key={r.revision} className={r.revision === project.revision ? 'is-current' : ''}>
            <div>
              <strong>Rev. {r.revision}</strong> <span className="faint">{r.label}</span>
              <div className="faint small">
                {new Date(r.createdAt).toLocaleString('pt-BR')} · {r.entityCount} objetos
              </div>
            </div>
            {r.revision !== project.revision && (
              <button className="text-btn" onClick={() => void restore(r.revision)}>
                Restaurar
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

const Banners = ({ draft, onDraftDone }: { draft: Draft | null; onDraftDone: () => void }) => {
  const state = useEditor((s) => s.saveState);
  const err = useEditor((s) => s.saveError);
  const project = useEditor((s) => s.project!);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      useEditor.getState().message((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {project.meta.isDemo && <div className="banner demo">Projeto demonstrativo com dados fictícios.</div>}
      {draft && (
        <div className="banner warn" role="alert">
          <span>
            Há um rascunho local não enviado de {new Date(draft.savedAt).toLocaleString('pt-BR')} ({Object.keys(draft.project.entities).length} objetos, base rev. {draft.baseRevision}).
          </span>
          <button
            className="btn small"
            onClick={() => {
              const st = useEditor.getState();
              st.replaceProject({ ...draft.project, revision: project.revision });
              // rascunho baseado em revisão antiga vira conflito explícito em vez de sobrescrever
              useEditor.setState({ savedRevision: draft.baseRevision, saveState: 'dirty' });
              onDraftDone();
              void saveNow();
            }}
          >
            Recuperar rascunho
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              clearDraft(project.id);
              onDraftDone();
            }}
          >
            Descartar
          </button>
        </div>
      )}
      {state === 'conflict' && (
        <div className="banner error" role="alert">
          <span>{err}</span>
          <button className="btn small" disabled={busy} onClick={() => void run(reloadFromServer)}>
            Carregar versão do servidor
          </button>
          <button className="btn small ghost" disabled={busy} onClick={() => void run(overwriteServer)} title="A versão do servidor continua disponível no histórico de revisões">
            Gravar a minha como nova revisão
          </button>
        </div>
      )}
      {state === 'error' && err && (
        <div className="banner error" role="alert">
          <span>Não foi possível salvar: {err}</span>
          <button className="btn small" onClick={() => void saveNow()}>
            Tentar de novo
          </button>
        </div>
      )}
    </>
  );
};

type Tab = 'props' | 'layers' | 'levels';

const VIEW_TABS: { id: ViewMode; label: string; icon: typeof Box; tip: string }[] = [
  { id: 'plan', label: 'Planta 2D', icon: MapIcon, tip: 'Planta do pavimento ativo' },
  { id: 'split', label: 'Planta + 3D', icon: Columns2, tip: 'Planta e 3D lado a lado, sincronizados' },
  { id: '3d', label: '3D', icon: Box, tip: 'Modelo 3D derivado da planta' },
];

const SOON = [
  { icon: FileText, label: 'Documentação', phase: 'Fase 4' },
  { icon: Clapperboard, label: 'Render Studio', phase: 'Fase 7' },
];

export const Editor = ({ projectId }: { projectId: string }) => {
  const viewMode = useEditor((s) => s.viewMode);
  const project = useEditor((s) => s.project);
  const canUndo = useEditor((s) => (s.historyTick, s.history.canUndo));
  const canRedo = useEditor((s) => (s.historyTick, s.history.canRedo));
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('props');
  const [revOpen, setRevOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    api.getProject(projectId).then(
      (p: Project) => {
        if (!alive) return;
        useEditor.getState().load(p);
        controller.setTool('select');
        const d = readDraft(p.id);
        if (d && d.project.id === p.id) setDraft(d);
        stop = startAutosave();
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      stop?.();
      useEditor.getState().unload();
    };
  }, [projectId]);

  if (error)
    return (
      <div className="center-state">
        <AlertTriangle />
        <p>{error}</p>
        <a className="btn" href="#/">
          Voltar aos projetos
        </a>
      </div>
    );
  if (!project)
    return (
      <div className="center-state">
        <Loader2 className="spin" />
        <p>Abrindo projeto…</p>
      </div>
    );

  return (
    <div className="editor">
      <header className="topbar">
        <a className="icon-btn" href="#/" aria-label="Voltar aos projetos" data-tip="Projetos">
          <ArrowLeft size={18} />
        </a>
        <Logo compact />
        <div className="project-title">
          <strong>{project.meta.name}</strong>
          {project.meta.code && <span className="faint mono">{project.meta.code}</span>}
        </div>
        <SaveBadge />
        <div className="topbar-spacer" />
        <div className="workspace-tabs" role="tablist" aria-label="Áreas de trabalho">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              className={`ws-tab${viewMode === t.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={viewMode === t.id}
              data-tip={t.tip}
              onClick={() => useEditor.getState().set({ viewMode: t.id })}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          {SOON.map((s) => (
            <button key={s.label} className="ws-tab" role="tab" aria-selected={false} disabled data-tip={`Ainda não disponível · ${s.phase}`}>
              <s.icon size={14} /> <span className="ws-label">{s.label}</span>
            </button>
          ))}
        </div>
        <div className="topbar-spacer" />
        <button className="icon-btn" onClick={() => useEditor.getState().undo()} disabled={!canUndo} aria-label="Desfazer" data-tip="Desfazer · Ctrl+Z">
          <Undo2 size={18} />
        </button>
        <button className="icon-btn" onClick={() => useEditor.getState().redo()} disabled={!canRedo} aria-label="Refazer" data-tip="Refazer · Ctrl+Y">
          <Redo2 size={18} />
        </button>
        <button className="icon-btn" onClick={() => controller.zoomExtents()} aria-label="Enquadrar tudo" data-tip="Enquadrar tudo · Z">
          <Maximize size={18} />
        </button>
        <div className="pop-anchor">
          <button className={`icon-btn${revOpen ? ' is-active' : ''}`} onClick={() => setRevOpen((v) => !v)} aria-label="Revisões" data-tip="Revisões">
            <HistoryIcon size={18} />
          </button>
          {revOpen && <RevisionsPopover onClose={() => setRevOpen(false)} />}
        </div>
        <ThemeToggle />
        <UserMenu />
      </header>

      <Banners draft={draft} onDraftDone={() => setDraft(null)} />

      <div className="editor-body">
        <ToolRail />
        <main className="stage">
          <div className={`views mode-${viewMode}`}>
            <div className="view-plan">
              <Canvas />
            </div>
            {viewMode !== 'plan' && (
              <div className="view-3d">
                <Suspense fallback={<div className="viewer3d viewer3d-loading">Carregando 3D…</div>}>
                  <Viewer3D />
                </Suspense>
              </div>
            )}
          </div>
          <CommandLine />
        </main>
        <aside className="side-panel">
          <div className="tabs" role="tablist">
            {(
              [
                ['props', 'Propriedades'],
                ['layers', 'Layers'],
                ['levels', 'Pavimentos'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'props' && <PropertiesPanel />}
            {tab === 'layers' && <LayersPanel />}
            {tab === 'levels' && <LevelsPanel />}
          </div>
        </aside>
      </div>
      <StatusBar />
    </div>
  );
};
