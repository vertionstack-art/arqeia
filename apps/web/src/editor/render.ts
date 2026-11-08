import {
  type Entity,
  type EntityDraft,
  type Id,
  type Layer,
  type LengthUnit,
  type SnapPoint,
  type Vec2,
  arcSweep,
  dimensionGeometry,
  formatLength,
  fromPolar,
  add,
  wallOutline,
  sub,
  norm,
  perp,
  mul,
  type WallGeometry,
  openingSymbol,
  wallPiecePolygon,
  roofGeometry,
} from '@traco/core';
import { type Size, toScreen, niceGridStep, viewBox } from './viewport.ts';
import type { View } from './store.ts';

export interface Theme {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  axisX: string;
  axisY: string;
  select: string;
  hover: string;
  preview: string;
  snap: string;
  paper: boolean;
}

export const readTheme = (el: HTMLElement): Theme => {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--canvas-bg'),
    gridMinor: v('--canvas-grid-minor'),
    gridMajor: v('--canvas-grid-major'),
    axisX: v('--canvas-axis-x'),
    axisY: v('--canvas-axis-y'),
    select: v('--canvas-select'),
    hover: v('--canvas-hover'),
    preview: v('--canvas-preview'),
    snap: v('--canvas-snap'),
    paper: document.documentElement.dataset.canvas === 'paper',
  };
};

export interface Scene {
  view: View;
  size: Size;
  entities: Entity[];
  layers: Map<Id, Layer>;
  selection: Set<Id>;
  hover: Id | null;
  highlight: Set<Id>;
  drafts: EntityDraft[];
  guides: [Vec2, Vec2][];
  snap: SnapPoint | null;
  cursor: Vec2 | null;
  box: { a: Vec2; b: Vec2 } | null;
  gridVisible: boolean;
  units: LengthUnit;
  theme: Theme;
  /** Geometria unida das paredes do pavimento (junções e vãos). */
  wallGeom: Map<Id, WallGeometry>;
}

/** Cor do layer adaptada ao fundo (branco vira navy no modo "papel"). */
const layerColor = (hex: string, paper: boolean): string => {
  if (!paper) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200 ? '#04044a' : hex;
};

/** Espessura de pena (mm) → pixels de tela, com mínimo legível. */
const penPx = (lw: number): number => (lw >= 0.5 ? 2 : lw >= 0.35 ? 1.5 : 1);

export const renderScene = (ctx: CanvasRenderingContext2D, s: Scene): void => {
  const { size, view, theme } = s;
  const S = (p: Vec2) => toScreen(view, size, p);
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  if (s.gridVisible) drawGrid(ctx, s);
  drawAxes(ctx, s);

  const draw = (e: Entity | EntityDraft, color: string, width: number, mode: 'normal' | 'selected' | 'preview') => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(mode === 'preview' ? [6, 4] : []);
    drawEntity(ctx, e, S, view.zoom, s.units, mode, 'id' in e ? s.wallGeom.get(e.id) : undefined);
  };

  // entidades normais
  for (const e of s.entities) {
    if (s.selection.has(e.id) || s.highlight.has(e.id)) continue;
    const layer = s.layers.get(e.layerId);
    const color = layerColor(layer?.color ?? '#ffffff', theme.paper);
    draw(e, e.id === s.hover ? theme.hover : color, penPx(layer?.lineWeight ?? 0.25) + (e.id === s.hover ? 1 : 0), 'normal');
  }
  // selecionadas por cima
  for (const e of s.entities) {
    if (!s.selection.has(e.id) && !s.highlight.has(e.id)) continue;
    draw(e, theme.select, 2, 'selected');
    drawGrips(ctx, e, S, theme.select);
  }
  // pré-visualização da ferramenta
  for (const d of s.drafts) draw(d, theme.preview, 1.25, 'preview');
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = theme.preview;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  for (const [a, b] of s.guides) line(ctx, S(a), S(b));
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (s.box) drawSelectionBox(ctx, s.box, S, theme);
  if (s.snap) drawSnapMarker(ctx, s.snap, S(s.snap.p), theme.snap);
  ctx.restore();
};

const line = (ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2) => {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
};

const poly = (ctx: CanvasRenderingContext2D, pts: Vec2[], closed: boolean) => {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
};

/** Arco no canvas: tela tem Y invertido, então ângulos trocam de sinal e o sentido vira horário. */
const arcPath = (ctx: CanvasRenderingContext2D, c: Vec2, rPx: number, start: number, end: number) => {
  ctx.beginPath();
  ctx.arc(c.x, c.y, rPx, -start, -(start + arcSweep(start, end)), true);
};

const drawEntity = (
  ctx: CanvasRenderingContext2D,
  e: Entity | EntityDraft,
  S: (p: Vec2) => Vec2,
  zoom: number,
  units: LengthUnit,
  mode: 'normal' | 'selected' | 'preview',
  geom?: WallGeometry,
) => {
  switch (e.type) {
    case 'line':
      line(ctx, S(e.a), S(e.b));
      break;
    case 'polyline':
      poly(ctx, e.points.map(S), e.closed);
      ctx.stroke();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(S(e.c).x, S(e.c).y, e.r * zoom, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'arc':
      arcPath(ctx, S(e.c), e.r * zoom, e.start, e.end);
      ctx.stroke();
      break;
    case 'wall': {
      if (geom) {
        drawJoinedWall(ctx, geom, S, mode);
        break;
      }
      const pts = wallOutline(e).map(S);
      poly(ctx, pts, true);
      ctx.save();
      ctx.globalAlpha = mode === 'normal' ? 0.22 : 0.3;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
      // eixo da parede (tracejado sutil) quando há zoom suficiente
      if (e.thickness * zoom > 10) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 1;
        line(ctx, S(e.a), S(e.b));
        ctx.restore();
      }
      break;
    }
    case 'slab': {
      poly(ctx, e.points.map(S), true);
      ctx.save();
      ctx.globalAlpha = mode === 'normal' ? 0.06 : 0.12;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.setLineDash(mode === 'preview' ? [6, 4] : [2, 3]);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'roof': {
      const rg = roofGeometry(e);
      // projeção da cobertura: tracejado longo (convenção de elemento acima do plano de corte)
      ctx.save();
      ctx.setLineDash([12, 6]);
      if (rg) {
        poly(ctx, rg.outline.map(S), true);
        ctx.stroke();
        line(ctx, S(rg.ridge[0]), S(rg.ridge[1]));
        // indicação de caimento: setas do meio da cumeeira para os beirais
        ctx.setLineDash([]);
        const m = { x: (rg.ridge[0].x + rg.ridge[1].x) / 2, y: (rg.ridge[0].y + rg.ridge[1].y) / 2 };
        const [q0, q1, q2, q3] = rg.outline;
        for (const edge of [
          [q0, q1],
          [q3, q2],
        ]) {
          const em = { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 };
          const tip = { x: m.x + (em.x - m.x) * 0.6, y: m.y + (em.y - m.y) * 0.6 };
          arrow(ctx, S({ x: m.x + (em.x - m.x) * 0.2, y: m.y + (em.y - m.y) * 0.2 }), S(tip));
        }
        if (zoom * 250 > 6) {
          ctx.font = `${Math.min(14, zoom * 250)}px var(--font-mono, monospace)`;
          ctx.textAlign = 'center';
          ctx.fillText(`i = ${e.pitch}%`, S(m).x, S(m).y - 6);
        }
      } else {
        poly(ctx, e.points.map(S), true);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'text': {
      const px = e.height * zoom;
      if (px < 2) {
        // muito pequeno para ler: representa como traço (level of detail)
        const p = S(e.p);
        line(ctx, p, { x: p.x + Math.max(2, e.text.length * px * 0.6), y: p.y });
        break;
      }
      const p = S(e.p);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-e.rotation);
      ctx.font = `500 ${px}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
      break;
    }
    case 'dimension': {
      const g = dimensionGeometry({ ...e, id: '', levelId: '' } as Extract<Entity, { type: 'dimension' }>);
      const d1 = S(g.d1);
      const d2 = S(g.d2);
      line(ctx, d1, d2);
      line(ctx, S(g.ext1[0]), S(g.ext1[1]));
      line(ctx, S(g.ext2[0]), S(g.ext2[1]));
      // tiques arquitetônicos a 45°
      const t = 5;
      const dir = norm(sub(d2, d1));
      const tick = mul(add(dir, perp(dir)), t / Math.SQRT2);
      for (const p of [d1, d2]) line(ctx, sub(p, tick), add(p, tick));
      const label = formatLength(g.value, units);
      const tp = S(g.textPos);
      const fs = Math.max(10, Math.min(14, 120 * zoom));
      ctx.save();
      ctx.translate(tp.x, tp.y);
      ctx.rotate(-g.textAngle);
      ctx.font = `500 ${fs}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, 0, -3);
      ctx.restore();
      break;
    }
  }
};

const arrow = (ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2) => {
  line(ctx, a, b);
  const d = norm(sub(b, a));
  const n = perp(d);
  const h = 7;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - d.x * h + n.x * h * 0.45, b.y - d.y * h + n.y * h * 0.45);
  ctx.lineTo(b.x - d.x * h - n.x * h * 0.45, b.y - d.y * h - n.y * h * 0.45);
  ctx.closePath();
  ctx.fill();
};

/** Parede com junções: trechos cheios entre os vãos, símbolos de porta/janela e vãos inválidos em vermelho. */
const drawJoinedWall = (ctx: CanvasRenderingContext2D, g: WallGeometry, S: (p: Vec2) => Vec2, mode: 'normal' | 'selected' | 'preview') => {
  for (const piece of g.pieces) {
    poly(ctx, wallPiecePolygon(g, piece.s0, piece.s1).map(S), true);
    ctx.save();
    ctx.globalAlpha = mode === 'normal' ? 0.32 : 0.4;
    ctx.fill();
    ctx.restore();
    ctx.stroke();
  }
  ctx.save();
  ctx.lineWidth = Math.max(1, ctx.lineWidth - 1);
  for (const r of g.openings) {
    if (!r.valid) {
      ctx.save();
      ctx.strokeStyle = '#ff4d5e';
      ctx.setLineDash([4, 3]);
      const s0 = Math.max(0, Math.min(g.length, r.s0));
      const s1 = Math.max(0, Math.min(g.length, r.s1));
      poly(ctx, wallPiecePolygon(g, s0, s1).map(S), true);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const sym = openingSymbol(g, r);
    for (const [a, b] of sym.lines) line(ctx, S(a), S(b));
    for (const arc of sym.arcs) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      arcPath(ctx, S(arc.c), arc.r * Math.abs(S({ x: 1, y: 0 }).x - S({ x: 0, y: 0 }).x), arc.start, arc.end);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
};

const grip = (ctx: CanvasRenderingContext2D, p: Vec2) => {
  ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
};

const drawGrips = (ctx: CanvasRenderingContext2D, e: Entity, S: (p: Vec2) => Vec2, color: string) => {
  ctx.fillStyle = color;
  ctx.setLineDash([]);
  const pts: Vec2[] = [];
  switch (e.type) {
    case 'line':
    case 'wall':
    case 'dimension':
      pts.push(e.a, e.b);
      break;
    case 'slab':
    case 'roof':
    case 'polyline':
      pts.push(...e.points);
      break;
    case 'circle':
      pts.push(e.c, add(e.c, { x: e.r, y: 0 }));
      break;
    case 'arc':
      pts.push(e.c, add(e.c, fromPolar(e.r, e.start)), add(e.c, fromPolar(e.r, e.end)));
      break;
    case 'text':
      pts.push(e.p);
      break;
  }
  for (const p of pts) grip(ctx, S(p));
};

const drawGrid = (ctx: CanvasRenderingContext2D, s: Scene) => {
  const step = niceGridStep(s.view.zoom, 14);
  const major = step * 5;
  const vb = viewBox(s.view, s.size);
  const drawLines = (st: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(vb.minX / st) * st; x <= vb.maxX; x += st) {
      const sx = Math.round(toScreen(s.view, s.size, { x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, s.size.h);
    }
    for (let y = Math.ceil(vb.minY / st) * st; y <= vb.maxY; y += st) {
      const sy = Math.round(toScreen(s.view, s.size, { x: 0, y }).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(s.size.w, sy);
    }
    ctx.stroke();
  };
  drawLines(step, s.theme.gridMinor);
  drawLines(major, s.theme.gridMajor);
};

const drawAxes = (ctx: CanvasRenderingContext2D, s: Scene) => {
  const o = toScreen(s.view, s.size, { x: 0, y: 0 });
  ctx.lineWidth = 1;
  ctx.strokeStyle = s.theme.axisX;
  line(ctx, { x: 0, y: Math.round(o.y) + 0.5 }, { x: s.size.w, y: Math.round(o.y) + 0.5 });
  ctx.strokeStyle = s.theme.axisY;
  line(ctx, { x: Math.round(o.x) + 0.5, y: 0 }, { x: Math.round(o.x) + 0.5, y: s.size.h });
};

const drawSelectionBox = (ctx: CanvasRenderingContext2D, box: { a: Vec2; b: Vec2 }, S: (p: Vec2) => Vec2, theme: Theme) => {
  const a = S(box.a);
  const b = S(box.b);
  // da esquerda para a direita: janela (contido); da direita para a esquerda: cruzamento (toca)
  const crossing = box.b.x < box.a.x;
  ctx.fillStyle = crossing ? 'rgba(67, 217, 163, 0.08)' : 'rgba(0, 164, 255, 0.08)';
  ctx.strokeStyle = crossing ? '#43d9a3' : theme.select;
  ctx.setLineDash(crossing ? [5, 4] : []);
  ctx.lineWidth = 1;
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.setLineDash([]);
};

/** Marcadores de snap no padrão CAD: quadrado, triângulo, círculo, X… */
const drawSnapMarker = (ctx: CanvasRenderingContext2D, sp: SnapPoint, p: Vec2, color: string) => {
  const r = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.setLineDash([]);
  ctx.beginPath();
  switch (sp.kind) {
    case 'endpoint':
      ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      break;
    case 'midpoint':
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.closePath();
      break;
    case 'center':
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      break;
    case 'quadrant':
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      break;
    case 'intersection':
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      break;
    case 'perpendicular':
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x - r, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + r);
      break;
    case 'tangent':
      ctx.arc(p.x, p.y + r / 2, r / 1.5, 0, Math.PI * 2);
      ctx.moveTo(p.x - r, p.y - r / 4);
      ctx.lineTo(p.x + r, p.y - r / 4);
      break;
    case 'nearest':
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r, p.y - r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.closePath();
      break;
    case 'grid':
      ctx.moveTo(p.x - r, p.y);
      ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x, p.y + r);
      break;
  }
  ctx.stroke();
};

export const SNAP_LABEL: Record<SnapPoint['kind'], string> = {
  endpoint: 'Extremidade',
  midpoint: 'Ponto médio',
  center: 'Centro',
  quadrant: 'Quadrante',
  intersection: 'Interseção',
  perpendicular: 'Perpendicular',
  tangent: 'Tangente',
  nearest: 'Mais próximo',
  grid: 'Grade',
};
