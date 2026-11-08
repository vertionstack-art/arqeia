import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { PROJECT_TYPES, UNIT_LABEL, type LengthUnit, type NewProjectInput, type ProjectType } from '@traco/core';
import { api } from '../api/client.ts';

const TYPE_LABEL: Record<ProjectType, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  corporativo: 'Corporativo',
  industrial: 'Industrial',
  institucional: 'Institucional',
  urbanistico: 'Urbanístico',
  reforma: 'Reforma',
  interiores: 'Interiores',
  paisagismo: 'Paisagismo',
  misto: 'Projeto misto',
};

const num = (s: string): number | undefined => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? undefined : v;
};

export const NewProjectDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<'blank' | 'demo'>('blank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: '',
    code: '',
    client: '',
    responsible: '',
    location: '',
    projectType: 'residencial' as ProjectType,
    units: 'm' as LengthUnit,
    scale: '50',
    siteWidth: '',
    siteDepth: '',
    levelCount: '1',
    northAngleDeg: '0',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (template === 'blank' && !f.name.trim()) return setError('Informe o nome do projeto.');
    const input: NewProjectInput = {
      name: f.name,
      code: f.code,
      client: f.client,
      responsible: f.responsible,
      location: f.location,
      projectType: f.projectType,
      units: f.units,
      scale: num(f.scale),
      siteWidth: num(f.siteWidth),
      siteDepth: num(f.siteDepth),
      levelCount: num(f.levelCount),
      northAngleDeg: num(f.northAngleDeg),
      timezone: f.timezone,
    };
    setBusy(true);
    try {
      const p = await api.createProject(template === 'demo' ? { demo: true } : input);
      onCreated(p.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <header className="dialog-head">
          <div>
            <p className="eyebrow">Novo projeto</p>
            <h2 className="display">
              Comece pelo <em>terreno</em>.
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="segmented" role="radiogroup" aria-label="Modelo inicial">
          <button type="button" role="radio" aria-checked={template === 'blank'} className={template === 'blank' ? 'is-active' : ''} onClick={() => setTemplate('blank')}>
            Em branco
          </button>
          <button type="button" role="radio" aria-checked={template === 'demo'} className={template === 'demo' ? 'is-active' : ''} onClick={() => setTemplate('demo')}>
            Demonstração (casa 10 × 8 m)
          </button>
        </div>

        {template === 'demo' ? (
          <p className="note">
            Cria um projeto <strong>demonstrativo com dados fictícios</strong>: terreno 12 × 25 m, edificação 10 × 8 m, paredes de 15 cm com 2,80 m de altura e cotas. É a
            base do Teste de Aceitação A.
          </p>
        ) : (
          <div className="form-grid">
            <label className="field span-2">
              <span>Nome do projeto *</span>
              <input value={f.name} onChange={set('name')} autoFocus maxLength={200} placeholder="Residência Alves" />
            </label>
            <label className="field">
              <span>Código</span>
              <input value={f.code} onChange={set('code')} maxLength={64} placeholder="ARQ-2026-014" />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select value={f.projectType} onChange={set('projectType')}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cliente</span>
              <input value={f.client} onChange={set('client')} maxLength={200} />
            </label>
            <label className="field">
              <span>Responsável técnico</span>
              <input value={f.responsible} onChange={set('responsible')} maxLength={200} />
            </label>
            <label className="field span-2">
              <span>Localização</span>
              <input value={f.location} onChange={set('location')} maxLength={500} placeholder="Endereço ou referência do lote" />
            </label>
            <label className="field">
              <span>Unidade</span>
              <select value={f.units} onChange={set('units')}>
                {(Object.keys(UNIT_LABEL) as LengthUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]} ({u})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Escala inicial</span>
              <span className="field-input">
                <em className="pre">1:</em>
                <input value={f.scale} onChange={set('scale')} inputMode="numeric" />
              </span>
            </label>
            <label className="field">
              <span>Frente do terreno</span>
              <span className="field-input">
                <input value={f.siteWidth} onChange={set('siteWidth')} inputMode="decimal" placeholder="12" />
                <em>{f.units}</em>
              </span>
            </label>
            <label className="field">
              <span>Profundidade do terreno</span>
              <span className="field-input">
                <input value={f.siteDepth} onChange={set('siteDepth')} inputMode="decimal" placeholder="25" />
                <em>{f.units}</em>
              </span>
            </label>
            <label className="field">
              <span>Pavimentos</span>
              <input value={f.levelCount} onChange={set('levelCount')} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Norte verdadeiro</span>
              <span className="field-input">
                <input value={f.northAngleDeg} onChange={set('northAngleDeg')} inputMode="decimal" />
                <em>° horário</em>
              </span>
            </label>
            <label className="field span-2">
              <span>Fuso horário (para estudos solares futuros)</span>
              <input value={f.timezone} onChange={set('timezone')} maxLength={64} />
            </label>
            <p className="note span-2">Sistema de coordenadas: cartesiano local (georreferenciamento entra com a planta de situação, Fase 4).</p>
          </div>
        )}

        {error && (
          <p className="note error" role="alert">
            {error}
          </p>
        )}

        <footer className="dialog-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />} Criar projeto
          </button>
        </footer>
      </form>
    </dialog>
  );
};
