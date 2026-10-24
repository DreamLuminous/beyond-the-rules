import type { ActionPlan, AgentPolicy, WorldSnapshot } from "@btr/contracts";
import { BRIDGE_TASKS, type BridgeTaskId } from "../game/puzzles/bridgeTasks";

export type BridgeDirection = {
  plan?: ActionPlan;
  policy: (world: WorldSnapshot) => AgentPolicy;
  reply: string;
};

type MoveStep = { id: string; targetId: string; x: number; y: number };

function movePlan(world: WorldSnapshot, summary: string, steps: MoveStep[], cost: number): ActionPlan {
  return {
    version: 1,
    requestId: `bridge-plan-${Date.now()}`,
    worldRevision: world.worldRevision,
    summary,
    estimatedCost: cost,
    requiresConfirmation: false,
    steps: steps.map((step, index) => ({
      id: step.id,
      dependsOn: index === 0 ? [] : [steps[index - 1]!.id],
      trigger: index === 0 ? { type: "immediate" as const } : { type: "stepCompleted" as const, stepId: steps[index - 1]!.id },
      command: {
        type: "physics.move" as const,
        targetId: step.targetId,
        destination: { x: step.x, y: step.y },
        durationMs: 700
      }
    }))
  };
}

function navigatePolicy(goal: string, targetId: string, stopDistance: number) {
  return (world: WorldSnapshot): AgentPolicy => ({
    version: 1,
    requestId: `bridge-policy-${Date.now()}`,
    worldRevision: world.worldRevision,
    goal,
    constraints: ["不要走进断谷", "只执行能力清单允许的行动"],
    steps: [
      { id: "inspect-target", dependsOn: [], action: { type: "inspect", targetId } },
      {
        id: "navigate-target",
        dependsOn: ["inspect-target"],
        action: { type: "navigate", targetId, stopDistance }
      }
    ]
  });
}

const WALKWAY: MoveStep[] = [
  { id: "move-middle", targetId: "stone.middle", x: 570, y: 556 },
  { id: "move-far", targetId: "stone.far", x: 685, y: 556 },
  { id: "move-slab", targetId: "stone.slab", x: 800, y: 556 }
];

export function createBridgeDirection(
  input: string,
  world: WorldSnapshot,
  task: BridgeTaskId
): BridgeDirection | null {
  const text = input.trim();
  if (!text) return null;

  if (task === 3 && /补|缺口|重新规划|检修|过不去|挡住|卡住|卡在/.test(text)) {
    const plan = movePlan(
      world,
      "把检修石板移到缩回的桥板缺口上",
      [{ id: "fill-gap", targetId: "stone.slab", x: 1510, y: 556 }],
      16
    );
    return {
      plan,
      policy: navigatePolicy("跨过补好的缺口，走到对岸装置", "waypoint.exit", 30),
      reply: "墨点重新观察了缺口，准备把检修石板移到桥板位置，再继续前进。"
    };
  }

  if (task === 3 && /继续|装置|出口|走|过去|过桥/.test(text)) {
    return {
      policy: navigatePolicy("走到对岸装置", "waypoint.exit", 30),
      reply: "墨点继续朝装置前进；如果桥板缩回，它会停在缺口前重新判断。"
    };
  }

  if (task === 2 && /过桥|对岸|搭|铺|路|石板|过去/.test(text)) {
    return {
      plan: movePlan(world, "把三块石板铺成连续通路", WALKWAY, 48),
      policy: navigatePolicy("沿石板通路走到对岸", "waypoint.far", 60),
      reply: "墨点打算先用规则笔把三块石板铺成连续通路，再沿着它走到对岸。"
    };
  }

  if (task === 1 && /第一块|开始|走|石板|过去|出发/.test(text)) {
    return {
      policy: navigatePolicy("走到第一块石板上", "stone.front", 40),
      reply: "墨点先观察第一块石板，再走到上面。它只会走你允许的落脚点。"
    };
  }

  if (/观察|检查|看看/.test(text)) {
    return {
      policy: world => ({
        version: 1,
        requestId: `bridge-policy-${Date.now()}`,
        worldRevision: world.worldRevision,
        goal: "观察断桥、石板与风场机关",
        constraints: ["不移动墨点位置"],
        steps: [
          { id: "inspect-stone", dependsOn: [], action: { type: "inspect", targetId: "stone.front" } },
          { id: "inspect-wind", dependsOn: ["inspect-stone"], action: { type: "inspect", targetId: "wind.field" } }
        ]
      }),
      reply: "墨点正在检查石板与风场机关。"
    };
  }

  if (task === 2 && /风|机关|旧桥/.test(text)) {
    return {
      policy: world => ({
        version: 1,
        requestId: `bridge-policy-${Date.now()}`,
        worldRevision: world.worldRevision,
        goal: "启动风场，尝试用旧桥机关过桥",
        constraints: ["先观察再启动机关"],
        steps: [
          { id: "inspect-wind", dependsOn: [], action: { type: "inspect", targetId: "wind.field" } },
          { id: "activate-wind", dependsOn: ["inspect-wind"], action: { type: "activate", targetId: "wind.field" } }
        ]
      }),
      reply: "墨点先检查风场，再启动它——这是另一条可选的旧桥路线。"
    };
  }

  return null;
}

export function taskObjective(task: BridgeTaskId): string {
  return BRIDGE_TASKS[task].objective;
}
