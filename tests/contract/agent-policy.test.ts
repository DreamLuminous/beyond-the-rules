import { describe, expect, it } from "vitest";
import { AgentPolicySchema } from "@btr/contracts";

describe("AgentPolicy V1", () => {
  it("accepts an inspect then navigate policy", () => {
    const result = AgentPolicySchema.safeParse({
      version: 1,
      requestId: "agent-demo-001",
      worldRevision: 0,
      goal: "接近并观察风场木箱",
      constraints: ["避免坠入断谷"],
      steps: [
        { id: "inspect", dependsOn: [], action: { type: "inspect", targetId: "crate.wind" } },
        {
          id: "navigate", dependsOn: ["inspect"],
          action: { type: "navigate", targetId: "crate.wind", stopDistance: 64 }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported free-form action", () => {
    const result = AgentPolicySchema.safeParse({
      version: 1,
      requestId: "agent-demo-002",
      worldRevision: 0,
      goal: "执行任意代码",
      constraints: [],
      steps: [{ id: "bad", dependsOn: [], action: { type: "runJavascript", code: "alert(1)" } }]
    });
    expect(result.success).toBe(false);
  });
});
