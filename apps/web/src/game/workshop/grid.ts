import type { LevelDraft, LevelObject, MirrorOrientation } from "@btr/contracts";

export const CELL = 60;
export const COLS = 30;
export const ROWS = 12;
export const WORLD_WIDTH = COLS * CELL;
export const WORLD_HEIGHT = ROWS * CELL;

export type Cell = { col: number; row: number };
export type CellKey = string;

export const cellKey = (cell: Cell): CellKey => `${cell.col},${cell.row}`;

export const parseCellKey = (key: CellKey): Cell => {
  const [col = 0, row = 0] = key.split(",").map(Number) as [number, number];
  return { col, row };
};

export const cellCenter = (cell: Cell) => ({
  x: cell.col * CELL + CELL / 2,
  y: cell.row * CELL + CELL / 2
});

export const pointCell = (point: { x: number; y: number }): Cell => ({
  col: Math.floor(point.x / CELL),
  row: Math.floor(point.y / CELL)
});

export const insideGrid = (cell: Cell): boolean =>
  cell.col >= 0 && cell.col < COLS && cell.row >= 0 && cell.row < ROWS;

export function objectCells(object: LevelObject): Cell[] {
  const width = object.size?.width ?? CELL;
  const height = object.size?.height ?? CELL;
  const left = object.position.x - width / 2;
  const top = object.position.y - height / 2;
  const first = { col: Math.floor(left / CELL), row: Math.floor(top / CELL) };
  const last = {
    col: Math.floor((left + width - 0.001) / CELL),
    row: Math.floor((top + height - 0.001) / CELL)
  };
  const cells: Cell[] = [];
  for (let row = first.row; row <= last.row; row += 1) {
    for (let col = first.col; col <= last.col; col += 1) cells.push({ col, row });
  }
  return cells;
}

export type MirrorCell = { id: string; cell: Cell; orientation: MirrorOrientation };

export type DraftGeometry = {
  draft: LevelDraft;
  solids: Set<CellKey>;
  staticSolids: Set<CellKey>;
  gates: LevelObject[];
  gateCells: Map<string, Cell[]>;
  mirrors: MirrorCell[];
  emitters: LevelObject[];
  receivers: LevelObject[];
  receiverCells: Map<string, CellKey>;
  exit?: LevelObject;
  log?: LevelObject;
};

function readOrientation(object: LevelObject): MirrorOrientation {
  return object.properties.orientation === "\\" ? "\\" : "/";
}

export function buildGeometry(
  draft: LevelDraft,
  options: { openGateIds?: ReadonlySet<string> } = {}
): DraftGeometry {
  const staticSolids = new Set<CellKey>();
  const gateCells = new Map<string, Cell[]>();
  const mirrors: MirrorCell[] = [];
  const emitters: LevelObject[] = [];
  const receivers: LevelObject[] = [];
  const receiverCells = new Map<string, CellKey>();
  const gates: LevelObject[] = [];
  const geometry: DraftGeometry = {
    draft,
    solids: staticSolids,
    staticSolids,
    gates,
    gateCells,
    mirrors,
    emitters,
    receivers,
    receiverCells
  };

  for (const object of draft.objects) {
    if (object.kind === "platform" || object.kind === "wall") {
      for (const cell of objectCells(object)) staticSolids.add(cellKey(cell));
    } else if (object.kind === "gate") {
      gates.push(object);
      gateCells.set(object.id, objectCells(object));
    } else if (object.kind === "mirror") {
      mirrors.push({ id: object.id, cell: pointCell(object.position), orientation: readOrientation(object) });
    } else if (object.kind === "emitter") {
      emitters.push(object);
    } else if (object.kind === "receiver") {
      receivers.push(object);
      receiverCells.set(object.id, cellKey(pointCell(object.position)));
    } else if (object.kind === "exit") {
      geometry.exit = object;
    } else if (object.kind === "log") {
      geometry.log = object;
    }
  }

  const openGateIds = options.openGateIds ?? new Set<string>();
  for (const gate of gates) {
    if (openGateIds.has(gate.id)) continue;
    for (const cell of gateCells.get(gate.id) ?? []) staticSolids.add(cellKey(cell));
  }
  return geometry;
}

export const isSolid = (geometry: DraftGeometry, cell: Cell): boolean =>
  geometry.solids.has(cellKey(cell));

export const isEmpty = (geometry: DraftGeometry, cell: Cell): boolean =>
  insideGrid(cell) && !isSolid(geometry, cell);

export function isStandable(geometry: DraftGeometry, cell: Cell): boolean {
  if (!insideGrid(cell) || isSolid(geometry, cell)) return false;
  const below = { col: cell.col, row: cell.row + 1 };
  return isSolid(geometry, below);
}

export function findSpawnCell(geometry: DraftGeometry): Cell | null {
  const origin = pointCell(geometry.draft.spawn);
  const candidates: Cell[] = [];
  for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
    for (let rowOffset = -2; rowOffset <= 3; rowOffset += 1) {
      candidates.push({ col: origin.col + colOffset, row: origin.row + rowOffset });
    }
  }
  return candidates.find(cell => isStandable(geometry, cell)) ?? null;
}
