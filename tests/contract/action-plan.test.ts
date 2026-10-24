import { describe, expect, it } from "vitest";
import { ActionPlanSchema } from "@btr/contracts";

describe("ActionPlan V1", () => {
  it("accepts a floating stone plan", () => {
    const result = ActionPlanSchema.safeParse({
      version: 1, requestId: "req-demo-001", worldRevision: 0,
      summary: "让石块缓慢浮起", estimatedCost: 10, requiresConfirmation: false,
      steps: [{ id: "raise-stone", dependsOn: [], trigger: { type: "immediate" },
        command: { type: "physics.setGravity", targetId: "stone.front", gravityScale: -0.15, durationTicks: 180 } }]
    });
    expect(result.success).toBe(true);
  });
});

