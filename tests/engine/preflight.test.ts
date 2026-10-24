import { describe, expect, it } from "vitest";
import { preflight } from "@btr/rule-engine";
import snapshot from "../fixtures/world-snapshot.floating-bridge.json";
import type { ActionPlan, WorldSnapshot } from "@btr/contracts";

const world = snapshot as WorldSnapshot;

function plan(targetId: string): ActionPlan {
  return {
    version: 1, requestId: "test-plan", worldRevision: 0, summary: "测试石块浮起",
    estimatedCost: 10, requiresConfirmation: false,
    steps: [{ id: "step-1", dependsOn: [], trigger: { type: "immediate" },
      command: { type: "physics.setGravity", targetId, gravityScale: -.1, durationTicks: 120 } }]
  };
}

describe("rule engine preflight", () => {
  it("accepts a legal target", () => expect(preflight(plan("stone.front"), world)).toEqual({ ok: true }));
  it("rejects an unknown target", () => expect(preflight(plan("stone.missing"), world)).toMatchObject({ ok: false, code: "TARGET_NOT_FOUND" }));
  it("rejects an immutable target", () => expect(preflight(plan("exit.portal"), world)).toMatchObject({ ok: false, code: "TARGET_IMMUTABLE" }));
});

