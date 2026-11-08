import { type Vec2, add, fromPolar, rad } from './geometry/vec.js';
import { type LengthUnit, parseLength } from './units.js';

/**
 * Entrada de coordenadas pelo teclado, no estilo CAD:
 *   x,y        absoluta
 *   @dx,dy     relativa ao último ponto
 *   @d<ang     polar relativa (ângulo em graus, anti-horário a partir de +X)
 *   d<ang      polar absoluta (a partir da origem)
 *   d          distância na direção atual do cursor (entrada direta)
 * Valores aceitam sufixo de unidade (mm, cm, m, in, ft) e vírgula decimal
 * quando o separador de coordenadas é ";" (ex.: "2,5;3").
 */
export type PointInput =
  | { kind: 'point'; point: Vec2 }
  | { kind: 'distance'; distance: number }
  | { kind: 'error'; message: string };

const splitPair = (s: string): [string, string] | null => {
  if (s.includes(';')) {
    const parts = s.split(';');
    return parts.length === 2 ? [parts[0], parts[1]] : null;
  }
  const parts = s.split(',');
  return parts.length === 2 ? [parts[0], parts[1]] : null;
};

export const parsePointInput = (raw: string, last: Vec2 | null, unit: LengthUnit): PointInput => {
  const text = raw.trim();
  if (!text) return { kind: 'error', message: 'Entrada vazia.' };
  const relative = text.startsWith('@');
  const body = relative ? text.slice(1) : text;
  if (relative && !last) return { kind: 'error', message: 'Coordenada relativa exige um ponto anterior.' };
  const origin = relative ? last! : { x: 0, y: 0 };

  if (body.includes('<')) {
    const [dStr, aStr] = body.split('<');
    const d = parseLength(dStr, unit);
    const a = Number(aStr.replace(',', '.'));
    if (d === null || !Number.isFinite(a)) return { kind: 'error', message: 'Formato polar inválido. Use @distância<ângulo.' };
    return { kind: 'point', point: add(origin, fromPolar(d, rad(a))) };
  }

  const pair = splitPair(body);
  if (pair) {
    const x = parseLength(pair[0], unit);
    const y = parseLength(pair[1], unit);
    if (x === null || y === null) return { kind: 'error', message: 'Coordenadas inválidas. Use x,y ou @dx,dy.' };
    return { kind: 'point', point: add(origin, { x, y }) };
  }

  if (!relative) {
    const d = parseLength(body, unit);
    if (d !== null) return { kind: 'distance', distance: d };
  }
  return { kind: 'error', message: 'Não entendi a entrada. Exemplos: 3,4  @2,0  @5<90  2.5' };
};
