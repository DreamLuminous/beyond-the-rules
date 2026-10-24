import { describe, expect, it } from "vitest";
import { ActionPlanSchema, AgentPolicySchema, type WorldSnapshot } from "@btr/contracts";
import { createBridgeDirection } from "../../apps/web/src/integration/bridgeDirector";

function world(): WorldSnapshot {
  return {
    version: 1,
    levelId: "floating-bridge",
    worldRevision: 3,
    selectedObjectIds: [],
    objective: "让墨点走到第一块石板上",
    constraints: [],
    budgetRemaining: 100,
    allowedCommands: ["physics.move", "mechanism.setState"],
    objects: [
      { id: "stone.front", kind: "stone", label: "前方石板", position: { x: 460, y: 556 }, state: {}, capabilities: [], immutable: false },
      { id: "stone.middle", kind: "stone", label: "中央石板", position: { x: 650, y: 610 }, state: {}, capabilities: [], immutable: false },
      { id: "stone.far", kind: "stone", label: "远处石板", position: { x: 880, y: 500 }, state: {}, capabilities: [], immutable: false },
      { id: "stone.slab", kind: "stone", label: "检修石板", position: { x: 1050, y: 560 }, state: {}, capabilities: [], immutable: false },
      { id: "waypoint.far", kind: "waypoint", label: "对岸落脚点", position: { x: 1100, y: 520 }, state: {}, capabilities: [], immutable: true },
      { id: "waypoint.exit", kind: "waypoint", label: "对岸装置前", position: { x: 1680, y: 520 }, state: {}, capabilities: [], immutable: true },
      { id: "wind.field", kind: "field", label: "风场", position: { x: 620, y: 545 }, state: {}, capabilities: [], immutable: false }
    ]
  };
}

describe("bridge director", () => {
  it("walks to the first stone for task one", () => {
    const direction = createBridgeDirection("走到第一块石板上", world(), 1);
    expect(direction).not.toBeNull();
    const policy = direction!.policy(world());
    expect(AgentPolicySchema.safeParse(policy).success).toBe(true);
    expect(policy.steps.at(-1)?.action).toMatchObject({ type: "navigate", targetId: "stone.front" });
  });

  it("lays three stones and then crosses for task two", () => {
    const direction = createBridgeDirection("用石板搭一条路，然后过桥", world(), 2);
    expect(direction?.plan).toBeDefined();
    const plan = ActionPlanSchema.parse(direction!.plan);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.map(step => step.command)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "physics.move", targetId: "stone.middle" })
      ])
    );
    const policy = direction!.policy({ ...world(), worldRevision: 4 });
    expect(AgentPolicySchema.safeParse(policy).success).toBe(true);
    expect(policy.worldRevision).toBe(4);
    expect(policy.steps.at(-1)?.action).toMatchObject({ type: "navigate", targetId: "waypoint.far" });
  });

  it("fills the retracted slab gap in task three", () => {
    const direction = createBridgeDirection("用石板补上缺口", world(), 3);
    expect(direction?.plan).toBeDefined();
    const plan = ActionPlanSchema.parse(direction!.plan);
    expect(plan.steps[0]?.command).toMatchObject({
      type: "physics.move",
      targetId: "stone.slab",
      destination: { x: 1510, y: 556 }
    });
    expect(direction!.policy(world()).steps.at(-1)?.action).toMatchObject({
      type: "navigate",
      targetId: "waypoint.exit"
    });
  });

  it("keeps the old keyword tools available and ignores unknown text", () => {
    expect(createBridgeDirection("继续走向装置", world(), 3)).not.toBeNull();
    expect(createBridgeDirection("先观察一下", world(), 1)).not.toBeNull();
    expect(createBridgeDirection("随便说点什么", world(), 1)).toBeNull();
  });
});
