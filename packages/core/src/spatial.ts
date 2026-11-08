import type { BBox } from './geometry/bbox.js';
import { boxesIntersect } from './geometry/bbox.js';

/**
 * Índice espacial por grade uniforme (spatial hash). Inserção/remoção O(células),
 * consulta por retângulo proporcional à área consultada. Adequado para
 * dezenas de milhares de entidades 2D; pode ser trocado por R-tree sem
 * alterar a interface.
 */
export class SpatialIndex {
  private cells = new Map<string, Set<string>>();
  private boxes = new Map<string, BBox>();
  /** Itens muito grandes ficam fora da grade para não poluir milhares de células. */
  private large = new Set<string>();

  constructor(private readonly cellSize = 5000, private readonly maxCellsPerItem = 4096) {}

  get size(): number {
    return this.boxes.size;
  }

  private range(b: BBox): [number, number, number, number] {
    const s = this.cellSize;
    return [Math.floor(b.minX / s), Math.floor(b.minY / s), Math.floor(b.maxX / s), Math.floor(b.maxY / s)];
  }

  insert(id: string, box: BBox): void {
    if (this.boxes.has(id)) this.remove(id);
    this.boxes.set(id, box);
    const [x0, y0, x1, y1] = this.range(box);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.maxCellsPerItem) {
      this.large.add(id);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = x + ':' + y;
        let set = this.cells.get(k);
        if (!set) this.cells.set(k, (set = new Set()));
        set.add(id);
      }
  }

  remove(id: string): void {
    const box = this.boxes.get(id);
    if (!box) return;
    this.boxes.delete(id);
    if (this.large.delete(id)) return;
    const [x0, y0, x1, y1] = this.range(box);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = x + ':' + y;
        const set = this.cells.get(k);
        if (!set) continue;
        set.delete(id);
        if (set.size === 0) this.cells.delete(k);
      }
  }

  query(box: BBox): string[] {
    const out = new Set<string>();
    const [x0, y0, x1, y1] = this.range(box);
    const area = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (area > this.cells.size) {
      // consulta maior que a grade ocupada: varre as caixas diretamente
      for (const [id, b] of this.boxes) if (boxesIntersect(b, box)) out.add(id);
      return [...out];
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const set = this.cells.get(x + ':' + y);
        if (!set) continue;
        for (const id of set) if (!out.has(id) && boxesIntersect(this.boxes.get(id)!, box)) out.add(id);
      }
    for (const id of this.large) if (boxesIntersect(this.boxes.get(id)!, box)) out.add(id);
    return [...out];
  }

  clear(): void {
    this.cells.clear();
    this.boxes.clear();
    this.large.clear();
  }
}
