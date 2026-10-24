/**
 * M2：基础关规划器（规则式）。
 * 输入 PlanRequest，输出合法 ActionPlan 或明确的拒绝/澄清。
 * 约束（docs/PLAN-B-AI-INTERACTION.md）：
 *  - 生成 1~16 步 DAG 计划；不生成 JavaScript 或未声明动作；
 *  - 双重校验：生成后先用 ActionPlanSchema 再校验一次，失败最多修复一次（降级为保守单步计划）；
 *  - 不可执行意图明确拒绝并给出理由。
 */
import { ActionPlanSchema, type ActionPlan, type PlanRequest, type WorldCommand } from "@btr/contracts";
import { plannerError, type PlannerError } from "./errors";
import { parseIntent } from "./intents";
import { resolveTargets, type Resolution } from "./reference";
import type { CompactObject } from "./snapshot";
import { parseCityPolicy } from "./city-policy";

type ActionStep = ActionPlan["steps"][number];

/** 每种命令的预算成本（与 rule-engine 的预检一致量级）。 */
export const COMMAND_COST: Record<WorldCommand["type"], number> = {
  "physics.move": 10,
  "physics.setGravity": 10,
  "physics.applyForce": 8,
  "mechanism.rotate": 12,
  "mechanism.setState": 6,
  "city.setPolicy": 20,
  "city.advanceSimulation": 15,
  "city.setIrrigation": 8,
  "city.setFacility": 8,
};

const VERB_TO_CAPABILITY: Record<string, string> = {
  float: "setGravity", sink: "setGravity", move: "move", push: "applyForce",
  rotate: "rotate", setState: "setState",
};

const VERB_TO_COMMAND: Record<string, WorldCommand["type"]> = {
  float: "physics.setGravity", sink: "physics.setGravity", move: "physics.move",
  push: "physics.applyForce", rotate: "mechanism.rotate", setState: "mechanism.setState",
};

export type PlanOutcome = { plan: ActionPlan } | { error: PlannerError };

export function generatePlan(request: PlanRequest): PlanOutcome {
  const { utterance, snapshot: world } = request;
  const intent = parseIntent(utterance);

  // 高级关（simulation）路由到城市策略解析
  if (world.allowedCommands.includes("city.setPolicy")) {
    return parseCityPolicy(request);
  }

  // 越权意图：明确拒绝
  if (intent.action?.verb === "forbidden") {
    return { error: { ...plannerError("COMMAND_NOT_ALLOWED", { ctx: { command: "直接改写结局" }, retryable: false }), userMessage: `这个请求我做不到：${intent.action.reason}。试着用场景里允许的规则来表达。`, retryable: false } };
  }

  // 无法理解
  if (!intent.action) {
    return { error: plannerError("INVALID_REQUEST") };
  }

  // 指代消解
  const resolution: Resolution = resolveTargets(intent.text, world);
  if (resolution.kind === "notFound") {
    return { error: plannerError("TARGET_NOT_FOUND", { ctx: { label: resolution.label }, retryable: true }) };
  }
  if (resolution.kind === "ambiguous") {
    return {
      error: plannerError("TARGET_AMBIGUOUS", {
        ctx: { label: resolution.label, candidates: resolution.candidates.map((c) => c.label).join("、") },
        clarify: `你说的「${resolution.label}」是指哪一个？`,
        candidates: resolution.candidates.map((c) => c.label),
        retryable: true,
      }),
    };
  }

  // 目标能力与关卡命令检查
  const commandType = VERB_TO_COMMAND[intent.action.verb];
  if (!commandType || !world.allowedCommands.includes(commandType)) {
    return { error: plannerError("COMMAND_NOT_ALLOWED", { ctx: { command: intent.action.verb }, retryable: false }) };
  }
  for (const obj of resolution.objects) {
    if (obj.immutable) {
      return { error: plannerError("TARGET_IMMUTABLE", { ctx: { label: obj.label }, retryable: false }) };
    }
    const need = VERB_TO_CAPABILITY[intent.action.verb];
    if (need && !obj.capabilities.includes(need)) {
      return { error: plannerError("COMMAND_NOT_ALLOWED", { ctx: { command: intent.action.verb }, retryable: false }) };
    }
  }

  // 生成步骤
  const steps = buildSteps(intent, resolution.objects, request.requestId);
  if (steps.length === 0) return { error: plannerError("INVALID_REQUEST") };

  // 序数单选：「第二块石头」只处理那一个
  const ordinalMatch = intent.text.match(/第\s*([一二两三四五六七八九]|\d+)\s*(块|个|张|条|只)/);
  let selected = steps;
  if (ordinalMatch && resolution.objects.length > 1) {
    const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const rawOrdinal = ordinalMatch[1] ?? "1";
    const idx = (/\d/.test(rawOrdinal) ? Number(rawOrdinal) : cn[rawOrdinal] ?? 1) - 1;
    const obj = resolution.objects[Math.min(idx, resolution.objects.length - 1)];
    if (obj) {
      const keep = steps.filter((s) => "targetId" in s.command && s.command.targetId === obj.id);
      if (keep.length > 0) selected = keep;
    }
  }

  const estimatedCost = selected.reduce((sum, s) => sum + (COMMAND_COST[s.command.type as WorldCommand["type"]] ?? 0), 0);
  if (estimatedCost > world.budgetRemaining) {
    return { error: plannerError("BUDGET_EXCEEDED", { retryable: false }) };
  }

  const summary = buildSummary(intent, resolution.objects);
  const plan: ActionPlan = {
    version: 1,
    requestId: request.requestId,
    worldRevision: world.worldRevision,
    summary,
    steps: selected,
    estimatedCost,
    requiresConfirmation: false,
  };

  // 双重校验：Zod 复核；失败一次则以保守单步计划修复
  const first = ActionPlanSchema.safeParse(plan);
  if (first.success) return { plan: first.data };

  const conservative = conservativePlan(plan, world);
  const second = ActionPlanSchema.safeParse(conservative);
  if (second.success) return { plan: second.data };
  return { error: plannerError("INVALID_REQUEST") };
}

function buildSteps(
  intent: ReturnType<typeof parseIntent>,
  objects: CompactObject[],
  _requestId: string
): ActionStep[] {
  const action = intent.action!;
  const steps: ActionStep[] = [];
  const simultaneous = intent.simultaneous;

  objects.forEach((obj, i) => {
    let command: WorldCommand;
    switch (action.verb) {
      case "float":
        command = { type: "physics.setGravity", targetId: obj.id, gravityScale: action.slow ? -0.15 : -0.3, durationTicks: action.slow ? 180 : 60 };
        break;
      case "sink":
        command = { type: "physics.setGravity", targetId: obj.id, gravityScale: 1, durationTicks: 60 };
        break;
      case "move": {
        const base = obj.position ?? { x: 0, y: 0 };
        command = { type: "physics.move", targetId: obj.id, destination: { x: base.x + action.dx, y: base.y + action.dy }, durationMs: 1000 };
        break;
      }
      case "push": {
        const f = action.direction === "left" ? { x: -300, y: 0 } : action.direction === "right" ? { x: 300, y: 0 } : action.direction === "up" ? { x: 0, y: -300 } : { x: 0, y: 300 };
        command = { type: "physics.applyForce", targetId: obj.id, force: f, durationTicks: 30 };
        break;
      }
      case "rotate": {
        const deg = Math.max(-360, Math.min(360, action.degrees));
        command = { type: "mechanism.rotate", targetId: obj.id, degrees: deg };
        break;
      }
      case "setState":
        command = { type: "mechanism.setState", targetId: obj.id, state: action.state };
        break;
      default:
        return;
    }
    const prev = steps[steps.length - 1];
    steps.push({
      id: `step-${i + 1}-${obj.id}`.replace(/[^a-z0-9._-]/gi, "").slice(0, 60),
      dependsOn: !simultaneous && prev ? [prev.id] : [],
      trigger: { type: "immediate" },
      command,
    });
  });
  return steps;
}

/** 保守修复：只保留第一个合法步骤，立即触发。 */
function conservativePlan(plan: ActionPlan, _world: PlanRequest["snapshot"]): ActionPlan {
  const firstStep = plan.steps[0];
  if (!firstStep) return plan;
  return {
    ...plan,
    steps: [{ ...firstStep, dependsOn: [], trigger: { type: "immediate" } }],
    summary: `${plan.summary.slice(0, 280)}`,
  };
}

function buildSummary(intent: ReturnType<typeof parseIntent>, objects: Array<{ label: string }>): string {
  const labels = objects.map((o) => o.label).join("、");
  const verbText: Record<string, string> = {
    float: "浮起", sink: "恢复下落", move: "移动", push: "推动",
    rotate: "旋转", setState: "切换状态", forbidden: "拒绝",
  };
  const v = intent.action ? verbText[intent.action.verb] ?? "操作" : "操作";
  const order = intent.sequential ? "依次" : intent.simultaneous ? "同时" : "";
  return `${order || ""}${labels.slice(0, 120)}${v}（${intent.text.slice(0, 60)}）`.slice(0, 300);
}
