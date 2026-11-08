import { useEffect, useRef } from 'react';
import { formatLength, UNIT_LABEL } from '@traco/core';
import { useEditor } from './store.ts';
import { controller } from './controller.ts';

const Toggle = ({ on, label, hint, onClick }: { on: boolean; label: string; hint: string; onClick: () => void }) => (
  <button className={`sb-toggle${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on} data-tip={hint}>
    {label}
  </button>
);

export const StatusBar = () => {
  const coordRef = useRef<HTMLSpanElement>(null);
  const project = useEditor((s) => s.project);
  const snap = useEditor((s) => s.snap);
  const ortho = useEditor((s) => s.ortho);
  const grid = useEditor((s) => s.gridVisible);
  const levelId = useEditor((s) => s.levelId);
  const zoom = useEditor((s) => s.view.zoom);
  const selection = useEditor((s) => s.selection.length);
  const st = useEditor.getState;

  // coordenadas atualizadas fora do React (evita re-render a cada movimento)
  useEffect(
    () =>
      controller.subscribe(() => {
        const el = coordRef.current;
        const p = controller.cursorWorld;
        const u = useEditor.getState().project?.settings.units ?? 'm';
        if (el) el.textContent = p ? `X ${formatLength(p.x, u)}   Y ${formatLength(p.y, u)}` : 'X —   Y —';
      }),
    [],
  );

  if (!project) return null;
  const u = project.settings.units;
  return (
    <footer className="statusbar">
      <span className="sb-coords mono" ref={coordRef}>
        X — Y —
      </span>
      <div className="sb-group">
        <Toggle on={snap.enabled} label="SNAP" hint="Snap a objetos (F3)" onClick={() => st().setSnap({ enabled: !snap.enabled })} />
        <Toggle on={snap.grid} label="GRADE" hint={`Snap à grade de ${formatLength(snap.gridSize, u)} (F9)`} onClick={() => st().setSnap({ grid: !snap.grid })} />
        <Toggle on={ortho} label="ORTO" hint="Modo ortogonal (F8)" onClick={() => st().toggleOrtho()} />
        <Toggle on={grid} label="GRID" hint="Mostrar grade (F7)" onClick={() => st().toggleGrid()} />
      </div>
      <label className="sb-field">
        Pavimento
        <select value={levelId} onChange={(e) => st().setLevel(e.target.value)}>
          {project.levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <span className="sb-item" data-tip="Unidade de entrada e exibição; o modelo é sempre gravado em milímetros">
        {UNIT_LABEL[u]}
      </span>
      <span className="sb-item">Escala 1:{project.settings.scale}</span>
      <span className="sb-item mono">{zoom >= 0.01 ? `${(zoom * 1000).toFixed(0)} px/m` : `${(zoom * 1e6).toFixed(0)} px/km`}</span>
      <span className="sb-item">{selection ? `${selection} selecionado(s)` : `${Object.keys(project.entities).length} objetos`}</span>
    </footer>
  );
};
