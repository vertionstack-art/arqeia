import { useEffect, useState } from 'react';
import { type LengthUnit, fromMM, parseLength } from '@traco/core';

/**
 * Campo de comprimento: exibe na unidade do projeto, aceita sufixos
 * ("15cm", "0.15m") e grava em mm. Só confirma em Enter/blur e com valor válido.
 */
export const LengthField = ({
  label,
  mm,
  units,
  onCommit,
  min,
  readOnly,
}: {
  label: string;
  mm: number;
  units: LengthUnit;
  onCommit?: (mm: number) => void;
  min?: number;
  readOnly?: boolean;
}) => {
  const fmt = (v: number) => String(Number(fromMM(v, units).toFixed(units === 'mm' ? 2 : 5)));
  const [text, setText] = useState(fmt(mm));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(fmt(mm));
    setBad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm, units]);
  const commit = () => {
    const v = parseLength(text, units);
    if (v === null || (min !== undefined && v <= min)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (Math.abs(v - mm) > 1e-9) onCommit?.(v);
  };
  return (
    <label className={`field${bad ? ' is-invalid' : ''}`}>
      <span>{label}</span>
      <span className="field-input">
        <input
          value={text}
          readOnly={readOnly || !onCommit}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(fmt(mm));
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-invalid={bad}
        />
        <em>{units}</em>
      </span>
    </label>
  );
};

export const NumberField = ({
  label,
  value,
  suffix,
  onCommit,
  decimals = 2,
  min,
}: {
  label: string;
  value: number;
  suffix?: string;
  onCommit?: (v: number) => void;
  decimals?: number;
  min?: number;
}) => {
  const fmt = (v: number) => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(fmt(value));
    setBad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || (min !== undefined && v <= min)) return setBad(true);
    setBad(false);
    if (Math.abs(v - value) > 1e-9) onCommit?.(v);
  };
  return (
    <label className={`field${bad ? ' is-invalid' : ''}`}>
      <span>{label}</span>
      <span className="field-input">
        <input
          value={text}
          readOnly={!onCommit}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
};

export const TextField = ({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== value && onCommit(text)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </span>
    </label>
  );
};

export const ReadOut = ({ label, value }: { label: string; value: string }) => (
  <div className="field readout">
    <span>{label}</span>
    <strong className="mono">{value}</strong>
  </div>
);
