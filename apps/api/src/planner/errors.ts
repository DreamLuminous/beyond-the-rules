/**
 * M0：错误码与中文用户反馈规范。
 * 错误码与 docs/CONTRACT-AND-INTEGRATION.md 的「必测错误码」一一对应。
 * 规则：
 *  - 用户消息必须是简体中文、可行动（告诉玩家下一步能做什么）；
 *  - `retryable` 标记客户端是否应提供「重试」按钮；
 *  - `clarify` 存在时表示规划器需要一个关键澄清问题，客户端应展示为追问而非报错。
 */

export type PlannerErrorCode =
  | "INVALID_REQUEST"
  | "TARGET_NOT_FOUND"
  | "TARGET_AMBIGUOUS"
  | "TARGET_IMMUTABLE"
  | "COMMAND_NOT_ALLOWED"
  | "PARAMETER_OUT_OF_RANGE"
  | "BUDGET_EXCEEDED"
  | "STALE_WORLD"
  | "INVALID_DEPENDENCY"
  | "CONDITION_TIMEOUT"
  | "MODEL_TIMEOUT"
  | "PLANNER_NOT_CONFIGURED";

export interface PlannerError {
  code: PlannerErrorCode;
  /** 面向玩家的中文反馈（事实 + 下一步建议），不暴露内部细节与密钥信息。 */
  userMessage: string;
  /** 需要玩家回答的澄清问题；存在时客户端应展示为追问表单而不是错误弹窗。 */
  clarify?: string;
  /** 是否建议重试。 */
  retryable: boolean;
  /** 追问时的候选对象，供客户端渲染快捷选择。 */
  candidates?: string[];
}

export const errorText: Record<PlannerErrorCode, (ctx?: Record<string, string | number>) => string> = {
  INVALID_REQUEST: () => "我没有理解这句话，请换一种说法，例如「让前面的石头慢慢浮起来」。",
  TARGET_NOT_FOUND: (c) => `我没有找到${c?.label ? `「${c.label}」` : "这个目标"}，可以点选场景中的物体后再说一次。`,
  TARGET_AMBIGUOUS: (c) => `「${c?.label ?? "它"}」可能指多个物体：${c?.candidates ?? ""}。请点选其中一个，或说得更具体一些。`,
  TARGET_IMMUTABLE: (c) => `「${c?.label ?? "该物体"}」是核心对象，不能被修改。试试操作别的物体。`,
  COMMAND_NOT_ALLOWED: (c) => `当前关卡还不能使用「${c?.command ?? "这个能力"}」。`,
  PARAMETER_OUT_OF_RANGE: (c) => `「${c?.name ?? "参数"}」超出了允许范围：${c?.range ?? ""}。`,
  BUDGET_EXCEEDED: () => "规则能量不够执行这个计划。可以拆成更小的步骤，或先撤销一次不需要的修改。",
  STALE_WORLD: () => "世界刚刚发生了变化，请基于最新状态再说一次。",
  INVALID_DEPENDENCY: () => "计划内部的步骤顺序有问题，已放弃。请重新描述。",
  CONDITION_TIMEOUT: () => "等待的条件在限定时间内没有达成，计划已停止。",
  MODEL_TIMEOUT: () => "AI 思考超时了，可以再试一次；文本输入始终可用。",
  PLANNER_NOT_CONFIGURED: () => "当前环境未配置 AI 模型，已切换到内置规则模式。",
};

export function plannerError(
  code: PlannerErrorCode,
  opts: { clarify?: string; retryable?: boolean; candidates?: string[]; ctx?: Record<string, string | number> } = {}
): PlannerError {
  return {
    code,
    userMessage: errorText[code](opts.ctx),
    ...(opts.clarify ? { clarify: opts.clarify } : {}),
    retryable: opts.retryable ?? false,
    ...(opts.candidates ? { candidates: opts.candidates } : {}),
  };
}
