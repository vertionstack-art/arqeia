import { useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import {
  type Entity,
  type Layer,
  type Level,
  type Vec2,
  angleOf,
  deg,
  dimensionGeometry,
  entityLabel,
  formatArea,
  formatLength,
  measureEntity,
  newId,
  rad,
  sub,
  updateEntity,
  UNIT_LABEL,
  PROJECT_TYPES,
} from '@traco/core';
import { useEditor } from './store.ts';
import { LengthField, NumberField, ReadOut, TextField } from './fields.tsx';

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

const PointFields = ({ label, p, onChange }: { label: string; p: Vec2; onChange: (p: Vec2) => void }) => {
  const units = useEditor((s) => s.project!.settings.units);
  return (
    <div className="field-pair">
      <LengthField label={`${label} X`} mm={p.x} units={units} onCommit={(x) => onChange({ ...p, x })} />
      <LengthField label={`${label} Y`} mm={p.y} units={units} onCommit={(y) => onChange({ ...p, y })} />
    </div>
  );
};

const EntityProps = ({ e }: { e: Entity }) => {
  const project = useEditor((s) => s.project!);
  const units = project.settings.units;
  const commit = useEditor((s) => s.commit);
  const set = (patch: Partial<Entity>, label = `Editar ${entityLabel[e.type].toLowerCase()}`) =>
    commit(label, [updateEntity(e, { ...e, ...patch } as Entity)]);
  const m = measureEntity(e);
  const locked = project.layers.find((l) => l.id === e.layerId)?.locked;

  return (
    <div className="props">
      <div className="props-head">
        <span className="chip">{entityLabel[e.type]}</span>
        <code className="mono faint" title="Identificador estável">
          {e.id.slice(0, 12)}…
        </code>
      </div>
      {locked && <p className="note">Layer bloqueado: desbloqueie para editar.</p>}
      <fieldset disabled={locked}>
        <label className="field">
          <span>Layer</span>
          <select value={e.layerId} onChange={(ev) => set({ layerId: ev.target.value }, 'Trocar layer')}>
            {project.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        {(e.type === 'line' || e.type === 'wall' || e.type === 'dimension') && (
          <>
            <PointFields label="Início" p={e.a} onChange={(a) => set({ a })} />
            <PointFields label="Fim" p={e.b} onChange={(b) => set({ b })} />
            <ReadOut label="Ângulo" value={`${deg(angleOf(sub(e.b, e.a))).toFixed(2)}°`} />
          </>
        )}
        {e.type === 'wall' && (
          <>
            <LengthField label="Espessura" mm={e.thickness} units={units} min={0} onCommit={(thickness) => set({ thickness })} />
            <LengthField label="Altura" mm={e.height} units={units} min={0} onCommit={(height) => set({ height })} />
          </>
        )}
        {e.type === 'dimension' && (
          <>
            <LengthField label="Afastamento" mm={e.offset} units={units} onCommit={(offset) => set({ offset })} />
            <ReadOut label="Valor medido" value={formatLength(dimensionGeometry(e).value, units)} />
          </>
        )}
        {(e.type === 'circle' || e.type === 'arc') && (
          <>
            <PointFields label="Centro" p={e.c} onChange={(c) => set({ c })} />
            <LengthField label="Raio" mm={e.r} units={units} min={0} onCommit={(r) => set({ r })} />
          </>
        )}
        {e.type === 'arc' && (
          <div className="field-pair">
            <NumberField label="Ângulo inicial" suffix="°" value={deg(e.start)} onCommit={(v) => set({ start: rad(v) })} />
            <NumberField label="Ângulo final" suffix="°" value={deg(e.end)} onCommit={(v) => set({ end: rad(v) })} />
          </div>
        )}
        {e.type === 'text' && (
          <>
            <TextField label="Texto" value={e.text} onCommit={(text) => set({ text })} />
            <PointFields label="Posição" p={e.p} onChange={(p) => set({ p })} />
            <LengthField label="Altura" mm={e.height} units={units} min={0} onCommit={(height) => set({ height })} />
            <NumberField label="Rotação" suffix="°" value={deg(e.rotation)} onCommit={(v) => set({ rotation: rad(v) })} />
          </>
        )}
        {e.type === 'polyline' && (
          <>
            <label className="field check">
              <input type="checkbox" checked={e.closed} onChange={(ev) => set({ closed: ev.target.checked }, ev.target.checked ? 'Fechar polilinha' : 'Abrir polilinha')} />
              <span>Fechada</span>
            </label>
            <details className="vertices">
              <summary>{e.points.length} vértices</summary>
              {e.points.slice(0, 64).map((p, i) => (
                <PointFields
                  key={i}
                  label={`V${i + 1}`}
                  p={p}
                  onChange={(np) => set({ points: e.points.map((q, j) => (j === i ? np : q)) })}
                />
              ))}
              {e.points.length > 64 && <p className="note">Mostrando 64 de {e.points.length} vértices.</p>}
            </details>
          </>
        )}
      </fieldset>

      <div className="measures">
        {m.length !== undefined && <ReadOut label="Comprimento" value={formatLength(m.length, units)} />}
        {m.area !== undefined && <ReadOut label="Área" value={formatArea(m.area, units)} />}
        {m.perimeter !== undefined && <ReadOut label="Perímetro" value={formatLength(m.perimeter, units)} />}
      </div>
      {e.type === 'wall' && (
        <p className="note">Paredes já guardam altura e espessura reais; aberturas e geometria 3D chegam na Fase 3.</p>
      )}
    </div>
  );
};

const MultiProps = ({ ents }: { ents: Entity[] }) => {
  const project = useEditor((s) => s.project!);
  const commit = useEditor((s) => s.commit);
  const counts = ents.reduce<Record<string, number>>((acc, e) => ((acc[entityLabel[e.type]] = (acc[entityLabel[e.type]] ?? 0) + 1), acc), {});
  const total = ents.reduce((s, e) => s + (measureEntity(e).length ?? 0), 0);
  return (
    <div className="props">
      <div className="props-head">
        <span className="chip">{ents.length} objetos</span>
      </div>
      <ul className="counts">
        {Object.entries(counts).map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </li>
        ))}
      </ul>
      <label className="field">
        <span>Mover para layer</span>
        <select
          value=""
          onChange={(ev) =>
            ev.target.value &&
            commit(
              'Trocar layer',
              ents.map((e) => updateEntity(e, { ...e, layerId: ev.target.value })),
            )
          }
        >
          <option value="">—</option>
          {project.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {total > 0 && <ReadOut label="Comprimento somado" value={formatLength(total, project.settings.units)} />}
    </div>
  );
};

const NoSelection = () => {
  const project = useEditor((s) => s.project!);
  const wall = useEditor((s) => s.wallDefaults);
  const textHeight = useEditor((s) => s.textHeight);
  const set = useEditor((s) => s.set);
  const units = project.settings.units;
  const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <div className="props">
      <h4 className="section-title">Padrões das ferramentas</h4>
      <LengthField label="Espessura da parede" mm={wall.thickness} units={units} min={0} onCommit={(thickness) => set({ wallDefaults: { ...wall, thickness } })} />
      <LengthField label="Altura da parede" mm={wall.height} units={units} min={0} onCommit={(height) => set({ wallDefaults: { ...wall, height } })} />
      <LengthField label="Altura do texto" mm={textHeight} units={units} min={0} onCommit={(h) => set({ textHeight: h })} />
      <h4 className="section-title">Projeto</h4>
      <ReadOut label="Código" value={project.meta.code || '—'} />
      <ReadOut label="Cliente" value={project.meta.client || '—'} />
      <ReadOut label="Tipo" value={typeLabel(project.meta.projectType)} />
      <ReadOut label="Unidade" value={UNIT_LABEL[units]} />
      <ReadOut label="Terreno" value={project.site.width ? `${formatLength(project.site.width, units)} × ${formatLength(project.site.depth, units)}` : '—'} />
      <ReadOut label="Norte verdadeiro" value={`${project.settings.northAngleDeg}°`} />
      <ReadOut label="Revisão" value={String(project.revision)} />
      <p className="note">Selecione um objeto para editar suas medidas. Tipos de projeto disponíveis: {PROJECT_TYPES.length}.</p>
    </div>
  );
};

export const PropertiesPanel = () => {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  if (!project) return null;
  const ents = selection.map((id) => project.entities[id]).filter((e): e is Entity => !!e);
  if (ents.length === 1) return <EntityProps e={ents[0]} key={ents[0].id} />;
  if (ents.length > 1) return <MultiProps ents={ents} />;
  return <NoSelection />;
};

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export const LayersPanel = () => {
  const project = useEditor((s) => s.project!);
  const current = useEditor((s) => s.layerId);
  const { commit, setLayer, message } = useEditor.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const counts = new Map<string, number>();
  for (const e of Object.values(project.entities)) counts.set(e.layerId, (counts.get(e.layerId) ?? 0) + 1);

  const update = (l: Layer, patch: Partial<Layer>, label: string) => commit(label, [{ collection: 'layers', id: l.id, before: l, after: { ...l, ...patch } }]);
  const add = () => {
    let n = project.layers.length;
    let name = `LAYER-${n}`;
    while (project.layers.some((l) => l.name === name)) name = `LAYER-${++n}`;
    const l: Layer = { id: newId('lay'), name, color: '#9fb4ff', lineWeight: 0.25, visible: true, locked: false };
    commit('Novo layer', [{ collection: 'layers', id: l.id, before: null, after: l }]);
    setLayer(l.id);
    setEditing(l.id);
  };
  const remove = (l: Layer) => {
    if (counts.get(l.id)) return message(`O layer "${l.name}" tem objetos; mova-os antes de excluir.`, 'error');
    if (l.id === current) return message('Não é possível excluir o layer atual.', 'error');
    if (project.layers.length === 1) return;
    commit('Excluir layer', [{ collection: 'layers', id: l.id, before: l, after: null }]);
  };
  const rename = (l: Layer, name: string) => {
    const n = name.trim();
    setEditing(null);
    if (!n || n === l.name) return;
    if (project.layers.some((x) => x.name === n)) return message(`Já existe um layer "${n}".`, 'error');
    update(l, { name: n }, 'Renomear layer');
  };

  return (
    <div className="layers">
      <div className="panel-toolbar">
        <span className="faint">{project.layers.length} layers</span>
        <button className="icon-btn" onClick={add} aria-label="Novo layer" data-tip="Novo layer">
          <Plus size={16} />
        </button>
      </div>
      <ul className="layer-list">
        {project.layers.map((l) => (
          <li key={l.id} className={l.id === current ? 'is-current' : ''}>
            <input
              type="radio"
              name="current-layer"
              checked={l.id === current}
              onChange={() => setLayer(l.id)}
              aria-label={`Tornar ${l.name} o layer atual`}
            />
            <input type="color" value={l.color} onChange={(e) => update(l, { color: e.target.value }, 'Cor do layer')} aria-label={`Cor de ${l.name}`} />
            {editing === l.id ? (
              <input
                className="layer-name-input"
                defaultValue={l.name}
                autoFocus
                onBlur={(e) => rename(l, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button className="layer-name" onClick={() => setLayer(l.id)} onDoubleClick={() => setEditing(l.id)} data-tip="Duplo clique para renomear">
                {l.name}
                <span className="faint">{counts.get(l.id) ?? 0}</span>
              </button>
            )}
            <select
              className="lw"
              value={l.lineWeight}
              onChange={(e) => update(l, { lineWeight: Number(e.target.value) }, 'Espessura do layer')}
              aria-label={`Espessura de ${l.name}`}
            >
              {[0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1].map((w) => (
                <option key={w} value={w}>
                  {w.toFixed(2)}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={() => update(l, { visible: !l.visible }, l.visible ? 'Ocultar layer' : 'Mostrar layer')} aria-label={l.visible ? 'Ocultar' : 'Mostrar'}>
              {l.visible ? <Eye size={15} /> : <EyeOff size={15} className="faint" />}
            </button>
            <button className="icon-btn" onClick={() => update(l, { locked: !l.locked }, l.locked ? 'Desbloquear layer' : 'Bloquear layer')} aria-label={l.locked ? 'Desbloquear' : 'Bloquear'}>
              {l.locked ? <Lock size={15} /> : <LockOpen size={15} className="faint" />}
            </button>
            <button className="icon-btn danger" onClick={() => remove(l)} aria-label={`Excluir ${l.name}`}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pavimentos
// ---------------------------------------------------------------------------

export const LevelsPanel = () => {
  const project = useEditor((s) => s.project!);
  const levelId = useEditor((s) => s.levelId);
  const { commit, setLevel, message } = useEditor.getState();
  const units = project.settings.units;
  const update = (l: Level, patch: Partial<Level>, label: string) => commit(label, [{ collection: 'levels', id: l.id, before: l, after: { ...l, ...patch } }]);
  const add = () => {
    const top = project.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    const l: Level = { id: newId('lvl'), name: `Pavimento ${project.levels.length}`, elevation: top.elevation + top.height + 200, height: top.height };
    commit('Novo pavimento', [{ collection: 'levels', id: l.id, before: null, after: l }]);
    setLevel(l.id);
  };
  const remove = (l: Level) => {
    if (project.levels.length === 1) return message('O projeto precisa de ao menos um pavimento.', 'error');
    if (Object.values(project.entities).some((e) => e.levelId === l.id)) return message(`"${l.name}" tem objetos; não pode ser excluído.`, 'error');
    if (l.id === levelId) setLevel(project.levels.find((x) => x.id !== l.id)!.id);
    commit('Excluir pavimento', [{ collection: 'levels', id: l.id, before: l, after: null }]);
  };
  const sorted = [...project.levels].sort((a, b) => b.elevation - a.elevation);
  return (
    <div className="levels">
      <div className="panel-toolbar">
        <span className="faint">{project.levels.length} pavimento(s)</span>
        <button className="icon-btn" onClick={add} aria-label="Novo pavimento" data-tip="Novo pavimento">
          <Plus size={16} />
        </button>
      </div>
      {sorted.map((l) => (
        <div key={l.id} className={`level-card${l.id === levelId ? ' is-current' : ''}`}>
          <div className="level-select" onClick={() => setLevel(l.id)}>
            <TextField label="Nome" value={l.name} onCommit={(name) => update(l, { name }, 'Renomear pavimento')} />
          </div>
          <div className="field-pair">
            <LengthField label="Cota" mm={l.elevation} units={units} onCommit={(elevation) => update(l, { elevation }, 'Cota do pavimento')} />
            <LengthField label="Pé-direito" mm={l.height} units={units} min={0} onCommit={(height) => update(l, { height }, 'Pé-direito')} />
          </div>
          <button className="text-btn danger" onClick={() => remove(l)}>
            Excluir
          </button>
        </div>
      ))}
    </div>
  );
};
