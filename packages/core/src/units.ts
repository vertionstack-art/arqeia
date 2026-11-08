/**
 * Unidades. O modelo interno é SEMPRE em milímetros; unidades do projeto
 * afetam apenas entrada e exibição. Isso evita conversões silenciosas.
 */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export const MM_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export const UNIT_LABEL: Record<LengthUnit, string> = {
  mm: 'Milímetros',
  cm: 'Centímetros',
  m: 'Metros',
  in: 'Polegadas',
  ft: 'Pés',
};

export const isImperial = (u: LengthUnit): boolean => u === 'in' || u === 'ft';

export const toMM = (value: number, unit: LengthUnit): number => value * MM_PER_UNIT[unit];
export const fromMM = (mm: number, unit: LengthUnit): number => mm / MM_PER_UNIT[unit];

const DEFAULT_PRECISION: Record<LengthUnit, number> = { mm: 0, cm: 1, m: 2, in: 2, ft: 3 };

export const formatLength = (mm: number, unit: LengthUnit, precision = DEFAULT_PRECISION[unit]): string => {
  const v = fromMM(mm, unit);
  const fixed = v.toFixed(precision);
  // evita "-0.00"
  return (Number(fixed) === 0 ? (0).toFixed(precision) : fixed) + ' ' + unit;
};

export const formatArea = (mm2: number, unit: LengthUnit): string => {
  if (isImperial(unit)) return (mm2 / (304.8 * 304.8)).toFixed(2) + ' ft²';
  return (mm2 / 1e6).toFixed(2) + ' m²';
};

/**
 * Converte um texto numérico com sufixo opcional ("2.5", "2,5m", "80cm", "12in")
 * para milímetros. Sem sufixo, usa a unidade do projeto.
 */
export const parseLength = (text: string, unit: LengthUnit): number | null => {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|ft|")?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const suffix = m[2]?.toLowerCase();
  const u: LengthUnit = suffix === '"' ? 'in' : ((suffix as LengthUnit | undefined) ?? unit);
  return toMM(n, u);
};
