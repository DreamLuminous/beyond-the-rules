/**
 * M2：快照压缩。
 * 发给模型的不是完整 WorldSnapshot，而是一个精简视图：
 *  - 只保留目标、预算、每个对象的 id/标签/位置/能力/不可变标记与关键状态；
 *  - 丢弃与本次请求无关的冗余字段，降低 token 与误读概率。
 */
import type { WorldSnapshot } from "@btr/contracts";

export interface CompactObject {
  id: string;
  label: string;
  kind: string;
  immutable: boolean;
  capabilities: string[];
  position?: { x: number; y: number };
  state: Record<string, string | number | boolean>;
}

export interface CompactSnapshot {
  levelId: string;
  objective: string;
  worldRevision: number;
  budgetRemaining: number;
  selectedObjectIds: string[];
  allowedCommands: string[];
  objects: CompactObject[];
}

export function compactSnapshot(world: WorldSnapshot): CompactSnapshot {
  return {
    levelId: world.levelId,
    objective: world.objective,
    worldRevision: world.worldRevision,
    budgetRemaining: world.budgetRemaining,
    selectedObjectIds: world.selectedObjectIds,
    allowedCommands: world.allowedCommands,
    objects: world.objects.map((o) => ({
      id: o.id,
      label: o.label,
      kind: o.kind,
      immutable: o.immutable,
      capabilities: o.capabilities,
      ...(o.position ? { position: { x: o.position.x, y: o.position.y } } : {}),
      state: o.state,
    })),
  };
}
