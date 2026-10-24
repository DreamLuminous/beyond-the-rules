import {
  cellKey,
  findSpawnCell,
  insideGrid,
  isSolid,
  isStandable,
  type Cell,
  type DraftGeometry
} from "./grid";

export type Reachability = {
  start: Cell | null;
  distance: Map<string, number>;
};

const JUMP_HORIZONTAL = 4;
const JUMP_HEIGHT = 2;
const MAX_VISITS = 4_000;

function landingAfterFall(geometry: DraftGeometry, from: Cell): Cell | null {
  let cell = from;
  for (let guard = 0; guard < 20; guard += 1) {
    if (!insideGrid(cell)) return null;
    if (isSolid(geometry, cell)) return null;
    if (isStandable(geometry, cell)) return cell;
    cell = { col: cell.col, row: cell.row + 1 };
  }
  return null;
}

function clearHeadroom(geometry: DraftGeometry, cell: Cell): boolean {
  return !isSolid(geometry, { col: cell.col, row: cell.row - 1 });
}

function clearJumpPath(geometry: DraftGeometry, from: Cell, to: Cell): boolean {
  const direction = Math.sign(to.col - from.col);
  if (direction === 0) return true;
  const row = Math.min(from.row, to.row);
  for (let col = from.col + direction; col !== to.col; col += direction) {
    if (isSolid(geometry, { col, row })) return false;
  }
  return true;
}

export function computeReachability(geometry: DraftGeometry): Reachability {
  const start = findSpawnCell(geometry);
  const distance = new Map<string, number>();
  if (!start) return { start: null, distance };

  distance.set(cellKey(start), 0);
  const queue: Cell[] = [start];

  const visit = (cell: Cell, nextDistance: number) => {
    if (!isStandable(geometry, cell)) return;
    const key = cellKey(cell);
    if (distance.has(key)) return;
    distance.set(key, nextDistance);
    queue.push(cell);
  };

  for (let index = 0; index < queue.length && queue.length < MAX_VISITS; index += 1) {
    const cell = queue[index];
    if (!cell) continue;
    const next = (distance.get(cellKey(cell)) ?? 0) + 1;

    for (const step of [-1, 1] as const) {
      const up = { col: cell.col + step, row: cell.row - 1 };
      if (insideGrid(up) && !isSolid(geometry, up) && isStandable(geometry, up)) {
        visit(up, next);
      }

      const side = { col: cell.col + step, row: cell.row };
      if (!insideGrid(side) || isSolid(geometry, side)) continue;
      if (isStandable(geometry, side)) {
        visit(side, next);
      } else {
        const landed = landingAfterFall(geometry, side);
        if (landed) visit(landed, next);
      }
    }

    if (!clearHeadroom(geometry, cell)) continue;

    for (let dx = -JUMP_HORIZONTAL; dx <= JUMP_HORIZONTAL; dx += 1) {
      for (let dy = -JUMP_HEIGHT; dy <= 0; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const target = { col: cell.col + dx, row: cell.row + dy };
        if (!isStandable(geometry, target)) continue;
        if (!clearHeadroom(geometry, target)) continue;
        if (!clearJumpPath(geometry, cell, target)) continue;
        visit(target, next);
      }
    }
  }

  return { start, distance };
}

export function isReachable(reachability: Reachability, cell: Cell): boolean {
  return reachability.distance.has(cellKey(cell));
}

export function adjacentStandingCells(geometry: DraftGeometry, cell: Cell): Cell[] {
  const candidates: Cell[] = [
    { col: cell.col - 1, row: cell.row },
    { col: cell.col + 1, row: cell.row },
    { col: cell.col, row: cell.row + 1 },
    { col: cell.col, row: cell.row - 1 }
  ];
  return candidates.filter(candidate => isStandable(geometry, candidate));
}
