import { ActionPlanSchema, type ActionPlan, type WorldSnapshot } from "@btr/contracts";

export type PlannerReply =
  | { kind: "plan"; plan: ActionPlan }
  | { kind: "error"; code: string; message: string };

/**
 * 调用 B 线的 /v1/plan 服务。失败、超时或未配置模型时返回 null，
 * 由调用方回退到本地规则规划器，保证关闭 AI 时游戏仍可玩。
 */
export async function requestServerPlan(
  utterance: string,
  snapshot: WorldSnapshot,
  requestId: string
): Promise<PlannerReply | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch("/v1/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ version: 1, requestId, utterance, snapshot })
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return {
        kind: "error",
        code: typeof payload.code === "string" ? payload.code : "MODEL_ERROR",
        message:
          typeof payload.userMessage === "string"
            ? payload.userMessage
            : "AI 服务暂时不可用，已切回本地规则。"
      };
    }
    const parsed = ActionPlanSchema.safeParse(payload);
    if (!parsed.success) {
      return { kind: "error", code: "INVALID_PLAN", message: "AI 计划未通过协议校验，已放弃执行。" };
    }
    return { kind: "plan", plan: parsed.data };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
