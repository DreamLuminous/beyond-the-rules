/**
 * M5：LLM 适配层（OpenAI 兼容协议）。
 * - 配置 MODEL_API_KEY 时走结构化输出（JSON mode），快照经压缩后入 prompt；
 * - 输出必须过 ActionPlanSchema 二次校验，失败把 Zod 问题回传模型修复一次；
 * - 15s 超时（MODEL_TIMEOUT，可重试）；
 * - 未配置 / 调用失败 / 超时 → 回退规则式规划器，保证「关闭 AI 时核心链路仍可完整展示」。
 */
import { ActionPlanSchema, type ActionPlan, type PlanRequest } from "@btr/contracts";
import { plannerError, type PlannerError } from "./errors";
import { compactSnapshot } from "./snapshot";
import { generatePlan, type PlanOutcome } from "./planner";

const TIMEOUT_MS = 15_000;

export interface LlmConfig {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
}

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  return { apiKey: env.MODEL_API_KEY || undefined, baseUrl: env.MODEL_BASE_URL || undefined, model: env.MODEL_NAME || undefined };
}

export function isLlmEnabled(cfg: LlmConfig): boolean {
  return Boolean(cfg.apiKey && cfg.baseUrl && cfg.model);
}

function systemPrompt(): string {
  return [
    "你是「规则之外」游戏的规划器。根据世界快照和玩家原话，输出一个 JSON 格式的 ActionPlan V1。",
    "严格要求：",
    "1. 只能使用快照 allowedCommands 中声明的命令类型，且目标对象的 capabilities 必须支持；",
    "2. 不得生成任何 JavaScript 代码或未声明的动作；",
    "3. 不可修改 immutable 对象；estimatedCost 不得超过 budgetRemaining；",
    "4. 步骤数 1~16，用 dependsOn 表达顺序；worldRevision 必须等于快照的 worldRevision；",
    "5. 若请求越权（直接通关、改天气等）或无法安全执行，输出 {\"reject\": \"原因\"}。",
    "只输出 JSON，不要输出任何其他文字。",
  ].join("\n");
}

async function callLlmOnce(cfg: LlmConfig, request: PlanRequest): Promise<ActionPlan | { reject: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl!.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: JSON.stringify({ utterance: request.utterance, snapshot: compactSnapshot(request.snapshot), requestId: request.requestId }) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty completion");
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && "reject" in (parsed as Record<string, unknown>)) {
      return { reject: String((parsed as Record<string, unknown>).reject) };
    }
    const plan = ActionPlanSchema.safeParse(parsed);
    if (!plan.success) throw new Error(`schema: ${plan.error.issues.map((i) => i.path.join(".")).join(",")}`);
    return plan.data;
  } finally {
    clearTimeout(timer);
  }
}

/** 一次修复机会：把 Zod 校验错误回传给模型重试。 */
async function repairOnce(cfg: LlmConfig, request: PlanRequest, problem: string): Promise<ActionPlan | { reject: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl!.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: JSON.stringify({ utterance: request.utterance, snapshot: compactSnapshot(request.snapshot), requestId: request.requestId }) },
          { role: "assistant", content: "（上一次输出不合法）" },
          { role: "user", content: `你的输出未通过校验：${problem}。请修正并重新输出完整 JSON ActionPlan。` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = ActionPlanSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content ?? "null"));
    if (!parsed.success) throw new Error("repair failed");
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

export async function generatePlanWithLlm(cfg: LlmConfig, request: PlanRequest, fallback: typeof generatePlan = generatePlan): Promise<PlanOutcome> {
  if (!isLlmEnabled(cfg)) return fallback(request);

  try {
    const first = await callLlmOnce(cfg, request);
    if ("reject" in first) {
      return { error: { ...plannerError("COMMAND_NOT_ALLOWED", { ctx: { command: "直接改写世界" } }), userMessage: `这个请求我做不到：${first.reject}` } };
    }
    return { plan: first };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
    if (aborted) {
      // 模型超时：可重试；同时回退规则式保证链路可用
      const fb = fallback(request);
      return "plan" in fb ? fb : { error: plannerError("MODEL_TIMEOUT", { retryable: true }) };
    }
    if (err instanceof Error && err.message.startsWith("schema:")) {
      try {
        const repaired = await repairOnce(cfg, request, err.message);
        if (!("reject" in repaired)) return { plan: repaired };
      } catch {
        /* 修复失败 → 回退 */
      }
    }
    // 其余上游错误：静默回退规则式（M5：模型不可用时游戏不冻结）
    return fallback(request);
  }
}
