import type { ActionPlan, AgentPolicy, WorldSnapshot } from "@btr/contracts";

export function createLocalDemoPolicy(input: string, world: WorldSnapshot): AgentPolicy | null {
  if (!/(墨点|机器人|走到|靠近|观察)/.test(input) || !/(箱|木箱)/.test(input)) return null;
  return {
    version: 1,
    requestId: `agent-${Date.now()}`,
    worldRevision: world.worldRevision,
    goal: "接近并观察风场木箱",
    constraints: ["避免坠入断谷", "停止在可交互距离内"],
    steps: [
      {
        id: "inspect-crate",
        dependsOn: [],
        action: { type: "inspect", targetId: "crate.wind" }
      },
      {
        id: "approach-crate",
        dependsOn: ["inspect-crate"],
        action: { type: "navigate", targetId: "crate.wind", stopDistance: 64 }
      }
    ]
  };
}

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
      summary: "启动风场，把木箱吹向压力机关", estimatedCost: 18, requiresConfirmation: false,
      steps: [
        { id: "start-wind", dependsOn: [], trigger: { type: "immediate" },
          command: { type: "mechanism.setState", targetId: "wind.field", state: "on" } },
        { id: "push-crate", dependsOn: ["start-wind"], trigger: { type: "stepCompleted", stepId: "start-wind" },
          command: { type: "physics.applyForce", targetId: "crate.wind", force: { x: 520, y: -60 }, durationTicks: 120 } }
      ]
    };
  }
  return null;
}

