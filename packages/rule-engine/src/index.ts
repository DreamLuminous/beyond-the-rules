import type { ActionPlan, WorldSnapshot } from "@btr/contracts";

export type PreflightResult = { ok: true } | { ok: false; code: string; message: string };

export function preflight(plan: ActionPlan, world: WorldSnapshot): PreflightResult {
  if (plan.worldRevision !== world.worldRevision)
    return { ok: false, code: "STALE_WORLD", message: "世界状态已经变化，请重新生成计划。" };
  if (plan.estimatedCost > world.budgetRemaining)
    return { ok: false, code: "BUDGET_EXCEEDED", message: "规则能量不足。" };
  const ids = new Set(world.objects.map(o => o.id));
  const immutable = new Set(world.objects.filter(o => o.immutable).map(o => o.id));
  for (const step of plan.steps) {
    const targetId = "targetId" in step.command ? step.command.targetId : undefined;
    if (targetId && !ids.has(targetId)) return { ok: false, code: "TARGET_NOT_FOUND", message: `目标 ${targetId} 不存在。` };
    if (targetId && immutable.has(targetId)) return { ok: false, code: "TARGET_IMMUTABLE", message: `目标 ${targetId} 不允许修改。` };
    if (!world.allowedCommands.includes(step.command.type as never))
      return { ok: false, code: "COMMAND_NOT_ALLOWED", message: `当前关卡未开放 ${step.command.type}。` };
  }
  const stepIds = new Set(plan.steps.map(s => s.id));
  for (const step of plan.steps) for (const dep of step.dependsOn)
    if (!stepIds.has(dep)) return { ok: false, code: "INVALID_DEPENDENCY", message: `依赖步骤 ${dep} 不存在。` };
  return { ok: true };
}

