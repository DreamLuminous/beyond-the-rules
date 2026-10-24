import { describe, expect, it } from "vitest";
import type { PlanRequest, WorldSnapshot } from "@btr/contracts";
import { generatePlan, resolveTargets } from "../../apps/api/src/planner";

function snapshot(): WorldSnapshot {
  return {
    version: 1,
    levelId: "floating-bridge",
    worldRevision: 0,
    selectedObjectIds: [],
    objective: "跨过断谷",
    constraints: [],
    budgetRemaining: 100,
    allowedCommands: [
      "physics.move",
      "physics.setGravity",
      "physics.applyForce",
      "mechanism.setState"
    ],
    objects: [
      { id: "stone.front", kind: "stone", label: "蓝色石板（前方）", position: { x: 460, y: 556 }, state: {}, capabilities: ["move", "setGravity", "applyForce"], immutable: false },
      { id: "stone.far", kind: "stone", label: "绿色石板（远处）", position: { x: 880, y: 500 }, state: {}, capabilities: ["move", "setGravity", "applyForce"], immutable: false },
      { id: "crate.wind", kind: "crate", label: "橙色木箱", position: { x: 300, y: 510 }, state: {}, capabilities: ["move", "applyForce"], immutable: false },
      { id: "platform.auxiliary", kind: "platform", label: "白色辅助平台", position: { x: 930, y: 590 }, state: {}, capabilities: ["move"], immutable: false }
    ]
  };
}

function ask(utterance: string): PlanRequest {
  return { version: 1, requestId: `req-absurd-${Math.random().toString(36).slice(2, 8)}`, utterance, snapshot: snapshot() };
}

describe("自由操控：颜色指代与离谱指令", () => {
  it("uses colour words to pick one object", () => {
    const resolution = resolveTargets("让蓝色石板浮起来", snapshot());
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind === "resolved") expect(resolution.objects[0]?.id).toBe("stone.front");
  });

  it("lets the crate jump upward", () => {
    const outcome = generatePlan(ask("让橙色木箱跳起来"));
    expect("plan" in outcome).toBe(true);
    if ("plan" in outcome) {
      const command = outcome.plan.steps[0]?.command;
      expect(command?.type).toBe("physics.applyForce");
      if (command?.type === "physics.applyForce") {
        expect(command.targetId).toBe("crate.wind");
        expect(command.force.y).toBeLessThan(0);
      }
    }
  });

  it("throws a stone far to the right", () => {
    const outcome = generatePlan(ask("把绿色石板扔到最右边"));
    expect("plan" in outcome).toBe(true);
    if ("plan" in outcome) {
      const command = outcome.plan.steps[0]?.command;
      expect(command?.type).toBe("physics.move");
      if (command?.type === "physics.move") {
        expect(command.targetId).toBe("stone.far");
        expect(command.destination.x).toBeGreaterThan(1000);
      }
    }
  });

  it("moves a platform into the sky", () => {
    const outcome = generatePlan(ask("把白色平台移到天上"));
    expect("plan" in outcome).toBe(true);
    if ("plan" in outcome) {
      const command = outcome.plan.steps[0]?.command;
      expect(command?.type).toBe("physics.move");
      if (command?.type === "physics.move") {
        expect(command.targetId).toBe("platform.auxiliary");
        expect(command.destination.y).toBeLessThan(300);
      }
    }
  });
});
