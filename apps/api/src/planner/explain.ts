/**
 * M4：解释与降级。
 * 只根据 ExecutionResult 解释，绝不宣称未发生的世界变化；
 * 区分「事实」（执行器结果）与「建议」（AI 推断，明确标注）；
 * 同一错误不循环重复；提示不直接泄露谜底。
 */
import type { ExecutionResult } from "@btr/contracts";

export interface Explanation {
  /** 事实部分：逐条对应执行器 stepResults 的中文复述。 */
  facts: string[];
  /** 建议部分：AI 推断的下一步提示，明确与事实分开。 */
  hints: string[];
  /** 给客户端的一句话总结。 */
  summary: string;
}

const STATUS_TEXT: Record<ExecutionResult["status"], string> = {
  completed: "计划已全部执行完成",
  rejected: "计划被拒绝",
  cancelled: "计划被取消",
  partially_completed: "计划部分执行后被停止",
};

const CODE_HINTS: Record<string, string> = {
  TARGET_NOT_FOUND: "目标不存在，可以点选物体后再说一次。",
  TARGET_AMBIGUOUS: "指代不明确，说得更具体些。",
  TARGET_IMMUTABLE: "这个物体是核心对象，换一个目标试试。",
  COMMAND_NOT_ALLOWED: "当前关卡还没有这个能力。",
  PARAMETER_OUT_OF_RANGE: "参数超范围了，试着说小一点的幅度。",
  BUDGET_EXCEEDED: "规则能量不足，可以撤销一次不需要的修改。",
  STALE_WORLD: "世界变了，基于最新状态重新说一次。",
  INVALID_DEPENDENCY: "步骤顺序有问题，重新描述一次。",
  CONDITION_TIMEOUT: "等待超时了，检查一下触发条件。",
};

export function explainResult(result: ExecutionResult, history: string[] = []): Explanation {
  const facts: string[] = [STATUS_TEXT[result.status]];

  for (const step of result.stepResults) {
    const detail = step.changes.length > 0 ? `（${step.changes.join("；")}）` : "";
    if (step.status === "completed") {
      facts.push(`步骤 ${step.stepId}：已执行${detail}`);
    } else if (step.status === "skipped") {
      facts.push(`步骤 ${step.stepId}：因前置失败被跳过`);
    } else {
      const why = step.code && CODE_HINTS[step.code] ? `：${CODE_HINTS[step.code]}` : `：${step.message}`;
      facts.push(`步骤 ${step.stepId} 被拒绝${why}`);
    }
  }

  if (result.undoToken) facts.push("本次修改可以撤销。");

  // 建议：只依据失败原因提示，不泄露谜底，也不重复玩家已见过的提示
  const hints: string[] = [];
  for (const step of result.stepResults) {
    if (step.status === "rejected" && step.code) {
      const hint = CODE_HINTS[step.code];
      if (hint && !history.includes(hint)) hints.push(hint);
    }
  }
  if (result.status === "completed" && hints.length === 0) {
    hints.push("可以继续用一句话描述下一步修改，或观察世界变化。");
  }
  if (result.status === "partially_completed") {
    hints.push("先解决被拒绝的步骤，再重提后面的部分。");
  }

  return {
    facts,
    hints,
    summary: result.userMessage || facts[0] || STATUS_TEXT[result.status],
  };
}
