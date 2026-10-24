import type { ActionPlan, WorldSnapshot } from "@btr/contracts";

export function createLocalDemoPlan(input: string, world: WorldSnapshot): ActionPlan | null {
  const requestId = `local-${Date.now()}`;
  if (/浮|升|失重|重力/.test(input)) {
    const targetIds = input.includes("三")
      ? ["stone.front", "stone.middle", "stone.far"]
      : ["stone.front"];
    return {
      version: 1, requestId, worldRevision: world.worldRevision,
      summary: targetIds.length === 3 ? "让三块石板依次浮起" : "让前方石板缓慢浮起",
      estimatedCost: targetIds.length * 10, requiresConfirmation: false,
      steps: targetIds.map((targetId, index) => ({
        id: `float-${index + 1}`,
        dependsOn: index === 0 ? [] : [`float-${index}`],
        trigger: index === 0 ? { type: "immediate" } : { type: "stepCompleted", stepId: `float-${index}` },
        command: { type: "physics.setGravity", targetId, gravityScale: -0.12, durationTicks: 240 }
      }))
    };
  }

  if (/移|挪|台阶|桥/.test(input)) {
    return {
      version: 1, requestId, worldRevision: world.worldRevision,
      summary: "把前方石板移动成第一阶台阶", estimatedCost: 16, requiresConfirmation: false,
      steps: [{ id: "move-front", dependsOn: [], trigger: { type: "immediate" },
        command: { type: "physics.move", targetId: "stone.front", destination: { x: 420, y: 475 }, durationMs: 900 } }]
    };
  }

  if (/推|吹|风/.test(input)) {
    return {
      version: 1, requestId, worldRevision: world.worldRevision,
      summary: "向右推动木箱", estimatedCost: 8, requiresConfirmation: false,
      steps: [{ id: "push-crate", dependsOn: [], trigger: { type: "immediate" },
        command: { type: "physics.applyForce", targetId: "crate.wind", force: { x: 360, y: -40 }, durationTicks: 60 } }]
    };
  }
  return null;
}

