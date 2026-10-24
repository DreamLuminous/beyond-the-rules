import type { LevelDraft, LevelObject } from "@btr/contracts";
import { CELL, objectCells, pointCell } from "../game/workshop/grid";

export type WorkshopEdit =
  | { ok: true; draft: LevelDraft; change: string }
  | { ok: false; message: string };

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };

function stepCount(text: string): number {
  const match = text.match(/([一二两三四五]|\d+)\s*格/);
  if (!match) return 1;
  const raw = match[1] ?? "1";
  return /\d/.test(raw) ? Number(raw) : CN_NUM[raw] ?? 1;
}

function shift(object: LevelObject, dx: number, dy: number): void {
  object.position = { x: object.position.x + dx, y: object.position.y + dy };
}

function insideGrid(object: LevelObject): boolean {
  return objectCells(object).every(cell => cell.col >= 0 && cell.col < 30 && cell.row >= 0 && cell.row < 12);
}

function clone(draft: LevelDraft): LevelDraft {
  return JSON.parse(JSON.stringify(draft)) as LevelDraft;
}

function addHidden(draft: LevelDraft): void {
  if (draft.objects.some(object => object.id === "log.echo")) return;
  draft.objects.push(
    {
      id: "hidden.ledge",
      kind: "platform",
      position: { x: 24 * CELL + CELL / 2, y: 8 * CELL + CELL / 2 },
      size: { width: CELL, height: CELL },
      properties: {}
    },
    {
      id: "hidden.shelf",
      kind: "platform",
      position: { x: 25 * CELL + CELL, y: 6 * CELL + CELL / 2 },
      size: { width: CELL * 2, height: CELL },
      properties: {}
    },
    {
      id: "log.echo",
      kind: "log",
      position: { x: 25 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 },
      size: { width: 28, height: 28 },
      properties: {}
    }
  );
}

function removeHidden(draft: LevelDraft): void {
  draft.objects = draft.objects.filter(
    object => object.id !== "log.echo" && !object.id.startsWith("hidden.")
  );
}

export function editWorkshopDraft(draft: LevelDraft, instruction: string): WorkshopEdit {
  const text = instruction.trim();
  if (!text) return { ok: false, message: "先告诉我你想改什么。" };

  const next = clone(draft);
  const direction = /左/.test(text) ? -1 : /右/.test(text) ? 1 : 0;
  const steps = stepCount(text);
  const delta = direction * steps * CELL;

  if (/隐藏|密室|秘道/.test(text)) {
    if (/去掉|移除|删除|不要|取消/.test(text)) {
      removeHidden(next);
      return { ok: true, draft: next, change: "移除了隐藏区域" };
    }
    addHidden(next);
    return { ok: true, draft: next, change: "加了一个隐藏书架区域" };
  }

  if (direction === 0) {
    return { ok: false, message: "我听懂了要改东西，但没听出方向。可以说“往左/往右移一格”。" };
  }

  if (/出口|传送门|装置/.test(text)) {
    const exit = next.objects.find(object => object.kind === "exit");
    if (!exit) return { ok: false, message: "这一关没有出口对象。" };
    shift(exit, delta, 0);
    if (!insideGrid(exit)) return { ok: false, message: "出口会被移出场景边界。" };
    return { ok: true, draft: next, change: `把出口${direction > 0 ? "右" : "左"}移了 ${steps} 格` };
  }

  if (/镜子/.test(text)) {
    const mirrors = next.objects.filter(object => object.kind === "mirror");
    if (mirrors.length === 0) return { ok: false, message: "这一关没有镜子。" };
    const onlyFirst = /第一面|第一块|左边那面/.test(text);
    const moving = onlyFirst ? mirrors.slice(0, 1) : mirrors;
    for (const mirror of moving) {
      const column = pointCell(mirror.position).col;
      shift(mirror, delta, 0);
      if (!insideGrid(mirror)) return { ok: false, message: "镜子会被移出场景边界。" };
      const receiver = next.objects.find(
        object => object.kind === "receiver" && pointCell(object.position).col === column
      );
      if (receiver) {
        shift(receiver, delta, 0);
        if (!insideGrid(receiver)) return { ok: false, message: "接收器会被移出场景边界。" };
      }
    }
    return {
      ok: true,
      draft: next,
      change: `把${onlyFirst ? "第一面" : "两面"}镜子和对应接收器${direction > 0 ? "右" : "左"}移了 ${steps} 格`
    };
  }

  if (/闸门|桥板|门/.test(text)) {
    const gates = next.objects.filter(object => object.kind === "gate");
    if (gates.length === 0) return { ok: false, message: "这一关没有闸门。" };
    for (const gate of gates) {
      const column = pointCell(gate.position).col;
      shift(gate, delta, 0);
      if (!insideGrid(gate)) return { ok: false, message: "闸门会被移出场景边界。" };
      for (const wall of next.objects) {
        if (wall.kind === "platform" && pointCell(wall.position).col === column && (wall.size?.height ?? 0) >= CELL * 3) {
          shift(wall, delta, 0);
        }
      }
    }
    return {
      ok: true,
      draft: next,
      change: `把闸门和上方墙体${direction > 0 ? "右" : "左"}移了 ${steps} 格`
    };
  }

  return {
    ok: false,
    message: "目前能直接改的有：出口、镜子、闸门、隐藏区域。例如“把出口往右移两格”。"
  };
}
