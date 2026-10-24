import type { LevelDraft, MirrorOrientation } from "@btr/contracts";
import {
  buildGeometry,
  cellKey,
  insideGrid,
  isSolid,
  pointCell,
  type Cell,
  type DraftGeometry
} from "./grid";

type Direction = { x: number; y: number };

const DIRECTIONS: Record<string, Direction> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
};

export type BeamTrace = {
  emitterId: string;
  cells: Cell[];
  hitReceiverId?: string;
};

export type BeamResult = {
  beams: BeamTrace[];
  litReceiverIds: Set<string>;
};

function reflect(direction: Direction, mirror: MirrorOrientation): Direction {
  return mirror === "/"
    ? { x: -direction.y, y: -direction.x }
    : { x: direction.y, y: direction.x };
}

function readDirection(properties: Record<string, string | number | boolean>): Direction {
  const value = properties.direction;
  if (typeof value === "string" && DIRECTIONS[value]) return DIRECTIONS[value]!;
  return { x: 1, y: 0 };
}

export function traceBeams(
  draft: LevelDraft,
  orientations: Map<string, MirrorOrientation>,
  geometry: DraftGeometry = buildGeometry(draft, {})
): BeamResult {
  const mirrorAt = new Map<string, { id: string; orientation: MirrorOrientation }>();
  for (const mirror of geometry.mirrors) {
    mirrorAt.set(cellKey(mirror.cell), {
      id: mirror.id,
      orientation: orientations.get(mirror.id) ?? mirror.orientation
    });
  }

  const receiverAt = new Map<string, string>();
  for (const [receiverId, key] of geometry.receiverCells) receiverAt.set(key, receiverId);

  const beams: BeamTrace[] = [];
  const litReceiverIds = new Set<string>();

  for (const emitter of geometry.emitters) {
    let direction = readDirection(emitter.properties);
    let current = pointCell(emitter.position);
    const cells: Cell[] = [];
    let hitReceiverId: string | undefined;

    for (let step = 0; step < 400; step += 1) {
      current = { col: current.col + direction.x, row: current.row + direction.y };
      if (!insideGrid(current)) break;
      cells.push(current);

      const receiverId = receiverAt.get(cellKey(current));
      if (receiverId) {
        hitReceiverId = receiverId;
        litReceiverIds.add(receiverId);
        break;
      }

      const mirror = mirrorAt.get(cellKey(current));
      if (mirror) {
        direction = reflect(direction, mirror.orientation);
        continue;
      }

      if (isSolid(geometry, current)) break;
    }

    beams.push({
      emitterId: emitter.id,
      cells,
      ...(hitReceiverId ? { hitReceiverId } : {})
    });
  }

  return { beams, litReceiverIds };
}
