import type { ComponentType } from 'react';
import {
  MousePointer2,
  Slash,
  Waypoints,
  Square,
  Circle,
  DraftingCompass,
  BrickWall,
  Ruler,
  Type,
  Move,
  Copy,
  RotateCw,
  Maximize2,
  FlipHorizontal2,
  Scissors,
  ArrowRightToLine,
  CornerDownRight,
  Crosshair,
  LandPlot,
} from 'lucide-react';
import { type ToolId, useEditor } from './store.ts';
import { controller } from './controller.ts';

interface ToolDef {
  id: ToolId;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Apelido digitável na linha de comando. */
  alias: string;
}

export const TOOL_GROUPS: { title: string; tools: ToolDef[] }[] = [
  { title: 'Seleção', tools: [{ id: 'select', label: 'Selecionar', icon: MousePointer2, alias: 'V' }] },
  {
    title: 'Arquitetura',
    tools: [{ id: 'wall', label: 'Parede', icon: BrickWall, alias: 'W' }],
  },
  {
    title: 'Desenho',
    tools: [
      { id: 'line', label: 'Linha', icon: Slash, alias: 'L' },
      { id: 'polyline', label: 'Polilinha', icon: Waypoints, alias: 'PL' },
      { id: 'rect', label: 'Retângulo', icon: Square, alias: 'REC' },
      { id: 'circle', label: 'Círculo', icon: Circle, alias: 'C' },
      { id: 'arc', label: 'Arco', icon: DraftingCompass, alias: 'A' },
      { id: 'text', label: 'Texto', icon: Type, alias: 'T' },
    ],
  },
  {
    title: 'Anotação',
    tools: [
      { id: 'dimension', label: 'Cota alinhada', icon: Ruler, alias: 'DIM' },
      { id: 'measure', label: 'Medir distância', icon: Crosshair, alias: 'DI' },
      { id: 'area', label: 'Medir área', icon: LandPlot, alias: 'AA' },
    ],
  },
  {
    title: 'Modificar',
    tools: [
      { id: 'move', label: 'Mover', icon: Move, alias: 'M' },
      { id: 'copy', label: 'Copiar', icon: Copy, alias: 'CO' },
      { id: 'rotate', label: 'Rotacionar', icon: RotateCw, alias: 'RO' },
      { id: 'scale', label: 'Escalonar', icon: Maximize2, alias: 'SC' },
      { id: 'mirror', label: 'Espelhar', icon: FlipHorizontal2, alias: 'MI' },
      { id: 'offset', label: 'Offset', icon: CornerDownRight, alias: 'O' },
      { id: 'trim', label: 'Aparar', icon: Scissors, alias: 'TR' },
      { id: 'extend', label: 'Estender', icon: ArrowRightToLine, alias: 'EX' },
    ],
  },
];

export const ToolRail = () => {
  const active = useEditor((s) => s.toolId);
  return (
    <nav className="tool-rail" aria-label="Ferramentas">
      {TOOL_GROUPS.map((g) => (
        <div className="tool-group" key={g.title} role="group" aria-label={g.title}>
          {g.tools.map((t) => (
            <button
              key={t.id}
              className={`tool-btn${active === t.id ? ' is-active' : ''}`}
              onClick={() => controller.setTool(t.id)}
              aria-pressed={active === t.id}
              aria-label={`${t.label} (${t.alias})`}
              data-tip={`${t.label} · ${t.alias}`}
            >
              <t.icon size={18} strokeWidth={1.6} />
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
};
