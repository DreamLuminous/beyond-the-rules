/**
 * M3：高级关（dry-river-city）策略解析。
 * 自然语言政策 → city.setPolicy / city.advanceSimulation 参数：
 *  - 供水比例总和必须为 100（缺省部分按剩余比例均摊补齐，不虚构）；
 *  - 「尽量照顾所有人」等缺少关键数字的请求 → 返回可修改草案（requiresConfirmation）或一个关键澄清问题；
 *  - 只输出策略依据，不虚构模拟结果（结果解释只读取 ExecutionResult）；
 *  - 不允许增加总水量或改写天气种子（由 intents 层先拒绝）。
 */
import type { ActionPlan, PlanRequest } from "@btr/contracts";
import { ActionPlanSchema } from "@btr/contracts";

type ActionStep = ActionPlan["steps"][number];
import { plannerError } from "./errors";
import { parseIntent } from "./intents";

export type PolicyDraft = {
  waterAllocation: { residential: number; agriculture: number; industry: number; ecology: number };
  irrigationWindow: "day" | "night" | "balanced";
  industryCap: number;
  days: number;
  basis: string;
};

type Allocation = PolicyDraft["waterAllocation"];
type PolicyOutcome =
  | { draft: PolicyDraft }
  | { draft: PolicyDraft; clarify: string; candidates: string[] };

const SECTOR_WORDS: Array<{ key: keyof Allocation; words: RegExp }> = [
  { key: "residential", words: /居民|民生|家用|生活用水/ },
  { key: "agriculture", words: /农业|灌溉|农田|庄稼|种地/ },
  { key: "industry", words: /工业|工厂|产能|企业/ },
  { key: "ecology", words: /生态|环境|河流|湿地|自然/ },
];

const normalize = (n: number) => Math.round(n * 10) / 10;

/** 从原话抽取各领域比例；只在确实捕获到数字时写入该领域。 */
function extractAllocation(text: string): Partial<Record<keyof Allocation, number>> {
  const found: Partial<Record<keyof Allocation, number>> = {};
  for (const { key, words } of SECTOR_WORDS) {
    // 领域词后紧跟数字，如「居民40」「居民 40%」
    const after = text.match(new RegExp(`(?:${words.source})[^0-9%，。、]{0,6}(\\d+(?:\\.\\d+)?)\\s*%?`));
    if (after && after[1] !== undefined) {
      found[key] = Number(after[1]);
      continue;
    }
    // 数字后紧跟领域词，如「40给居民」
    const before = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%?\\s*份?[^0-9，。、]{0,4}(?:给|分给|留给)?\\s*(?:${words.source})`));
    if (before && before[1] !== undefined) found[key] = Number(before[1]);
  }
  return found;
}

function parseWindow(text: string): PolicyDraft["irrigationWindow"] {
  if (/晚上|夜里|夜间|深夜/.test(text)) return "night";
  if (/白天|日间|上午|下午/.test(text)) return "day";
  return "balanced";
}

function parseIndustryCap(text: string): number | null {
  if (!/工业[^0-9]{0,10}(?:不超过|上限|最多|控制在|cap)/i.test(text)) return null;
  const m = text.match(/工业[^0-9]{0,10}(?:不超过|上限|最多|控制在|cap)\s*(\d+(?:\.\d+)?)/i);
  if (m) return Math.min(100, Number(m[1]));
  return null;
}

function parseDays(text: string): number {
  const m = text.match(/(?:模拟|推进|运行|跑)\s*(\d+)\s*天/) ?? text.match(/(\d+)\s*天/);
  const v = m ? Number(m[1]) : 7;
  return Math.max(1, Math.min(7, v));
}

function balancedDraft(text: string): PolicyDraft {
  return {
    waterAllocation: { residential: 25, agriculture: 25, industry: 25, ecology: 25 },
    irrigationWindow: parseWindow(text),
    industryCap: parseIndustryCap(text) ?? 30,
    days: parseDays(text),
    basis: "未识别到具体比例，采用均分草案",
  };
}

function residentFirstDraft(text: string): PolicyDraft {
  return {
    waterAllocation: { residential: 40, agriculture: 20, industry: 20, ecology: 20 },
    irrigationWindow: parseWindow(text),
    industryCap: parseIndustryCap(text) ?? 25,
    days: parseDays(text),
    basis: "按「优先保障居民」生成草案",
  };
}

export function draftPolicy(utterance: string): PolicyOutcome {
  const text = utterance;
  const alloc = extractAllocation(text);
  const keys = Object.keys(alloc) as Array<keyof Allocation>;
  const explicitSum = keys.reduce((s, k) => s + (alloc[k] ?? 0), 0);

  // 完整明确的四项比例
  if (keys.length === 4 && Math.abs(explicitSum - 100) < 0.001) {
    return {
      draft: {
        waterAllocation: {
          residential: normalize(alloc.residential!), agriculture: normalize(alloc.agriculture!),
          industry: normalize(alloc.industry!), ecology: normalize(alloc.ecology!),
        },
        irrigationWindow: parseWindow(text),
        industryCap: parseIndustryCap(text) ?? 30,
        days: parseDays(text),
        basis: "按原话中的四项比例直接生成",
      },
    };
  }

  // 给了部分数字：按剩余权重均摊，产出草案 + 澄清
  if (keys.length > 0) {
    const rest = Math.max(0, 100 - explicitSum);
    const missing = (["residential", "agriculture", "industry", "ecology"] as Array<keyof Allocation>).filter((k) => !(k in alloc));
    const each = missing.length > 0 ? normalize(rest / missing.length) : 0;
    const merged: Allocation = {
      residential: alloc.residential ?? each,
      agriculture: alloc.agriculture ?? each,
      industry: alloc.industry ?? each,
      ecology: alloc.ecology ?? each,
    };
    const sum = normalize(Object.values(merged).reduce((a, b) => a + b, 0));
    if (sum !== 100) merged.residential = normalize(merged.residential + (100 - sum));
    const missingLabels = missing
      .map((k) => ({ residential: "居民", agriculture: "农业", industry: "工业", ecology: "生态" }[k]))
      .join("、");
    return {
      draft: {
        waterAllocation: merged,
        irrigationWindow: parseWindow(text),
        industryCap: parseIndustryCap(text) ?? 30,
        days: parseDays(text),
        basis: `原话只给出部分比例，未提到的${missingLabels}按剩余均摊，可修改后再执行`,
      },
      clarify: `没有听到全部四项比例，${missingLabels}暂按均摊处理，这样可以吗？`,
      candidates: ["就这样执行", "我要自己改比例"],
    };
  }

  // 模糊价值取向：返回可修改草案，并要求玩家确认
  if (/尽量照顾|所有人|公平|均等|均衡|平衡/.test(text)) {
    return {
      draft: balancedDraft(text),
      clarify: "四项比例暂按均分处理，这样可以吗？",
      candidates: ["就这样执行", "我要自己改比例"],
    };
  }
  if (/居民优先|优先居民|先保居民|保民生/.test(text)) {
    return {
      draft: residentFirstDraft(text),
      clarify: "已按居民优先生成草案，这样可以吗？",
      candidates: ["就这样执行", "我要自己改比例"],
    };
  }

  // 完全没有关键数字
  return {
    draft: balancedDraft(text),
    clarify: "想先照顾哪一块？居民、农业、工业还是生态？",
    candidates: ["居民优先", "尽量公平", "我自己说比例"],
  };
}

export function parseCityPolicy(request: PlanRequest): { plan: ActionPlan } | { error: ReturnType<typeof plannerError> } {
  const intent = parseIntent(request.utterance);
  if (intent.action?.verb === "forbidden") {
    return { error: { ...plannerError("COMMAND_NOT_ALLOWED", { ctx: { command: "改写世界规则" } }), userMessage: `这个请求我做不到：${intent.action.reason}。` } };
  }

  const outcome = draftPolicy(request.utterance);
  const d = outcome.draft;

  const steps: ActionStep[] = [
    {
      id: "step-city-policy",
      dependsOn: [],
      trigger: { type: "immediate" },
      command: { type: "city.setPolicy", waterAllocation: d.waterAllocation, irrigationWindow: d.irrigationWindow, industryCap: d.industryCap },
    },
    {
      id: "step-city-sim",
      dependsOn: ["step-city-policy"],
      trigger: { type: "stepCompleted", stepId: "step-city-policy" },
      command: { type: "city.advanceSimulation", days: d.days },
    },
  ];

  const estimatedCost = 20 + 15;
  if (estimatedCost > request.snapshot.budgetRemaining) {
    return { error: plannerError("BUDGET_EXCEEDED") };
  }

  const plan: ActionPlan = {
    version: 1,
    requestId: request.requestId,
    worldRevision: request.snapshot.worldRevision,
    summary: `城市策略：居民${d.waterAllocation.residential}/农业${d.waterAllocation.agriculture}/工业${d.waterAllocation.industry}/生态${d.waterAllocation.ecology}，${{ day: "白天", night: "夜间", balanced: "均衡" }[d.irrigationWindow]}灌溉，工业上限${d.industryCap}，模拟${d.days}天。依据：${d.basis}。`,
    steps,
    estimatedCost,
    // 草案需要玩家确认后才执行；含明确比例的直接请求不确认
    requiresConfirmation: "clarify" in outcome,
  };

  const check = ActionPlanSchema.safeParse(plan);
  if (check.success) return { plan: check.data };
  return { error: plannerError("PARAMETER_OUT_OF_RANGE", { ctx: { name: "供水比例", range: "各项 0~100 且总和 100" } }) };
}
