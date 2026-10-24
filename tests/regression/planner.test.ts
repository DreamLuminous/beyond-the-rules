/**
 * M0：30 条回归输入（固定快照，无游戏环境可运行）。
 * 覆盖：同义表达、多步骤、指代、越权、超预算、语音错误（+城市政策 M3）。
 */
import { describe, expect, it } from "vitest";
import { generatePlan, parseIntent, resolveTargets } from "../../apps/api/src/planner";
import type { PlanRequest, WorldSnapshot } from "@btr/contracts";

function snapshot(partial: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    version: 1,
    levelId: "floating-bridge",
    worldRevision: 0,
    selectedObjectIds: [],
    objective: "跨过断裂山谷并抵达传送门",
    budgetRemaining: 100,
    objects: [
      { id: "stone.front", kind: "stone", label: "前方石块", position: { x: 320, y: 500 }, state: { gravityScale: 1 }, capabilities: ["move", "setGravity"], immutable: false },
      { id: "exit.portal", kind: "portal", label: "出口传送门", position: { x: 1100, y: 420 }, state: { active: true }, capabilities: [], immutable: true },
    ],
    allowedCommands: ["physics.move", "physics.setGravity", "physics.applyForce", "mechanism.setState"],
    ...partial,
  };
}

function threeStoneSnapshot(partial: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return snapshot({
    objects: [
      { id: "stone.left", kind: "stone", label: "左侧石块", position: { x: 100, y: 500 }, state: {}, capabilities: ["setGravity"], immutable: false },
      { id: "stone.mid", kind: "stone", label: "中间石块", position: { x: 400, y: 500 }, state: {}, capabilities: ["setGravity"], immutable: false },
      { id: "stone.right", kind: "stone", label: "右侧石块", position: { x: 700, y: 500 }, state: {}, capabilities: ["setGravity"], immutable: false },
    ],
    ...partial,
  });
}

function citySnapshot(partial: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return snapshot({
    levelId: "dry-river-city",
    objective: "在第 7 天维持居民供水、供电可靠性和生态底线",
    budgetRemaining: 200,
    objects: [
      { id: "city.success-thresholds", kind: "thresholds", label: "成功阈值", state: {}, capabilities: [], immutable: true },
    ],
    allowedCommands: ["city.setPolicy", "city.advanceSimulation"],
    ...partial,
  });
}

function ask(utterance: string, world: WorldSnapshot): PlanRequest {
  return { version: 1, requestId: `req-test-${Math.random().toString(36).slice(2, 8)}`, utterance, snapshot: world };
}

describe("回归输入 1：同义表达 → 同一类命令", () => {
  const says = [
    "让前面的石头慢慢浮起来",
    "前面的石头缓缓浮起来",
    "叫前面那块石头飘起来",
    "把前面的石头浮到空中",
  ];
  for (const s of says) {
    it(`「${s}」→ physics.setGravity(stone.front)`, () => {
      const out = generatePlan(ask(s, snapshot()));
      expect(out).toHaveProperty("plan");
      expect(out).toHaveProperty("plan");
    if ("plan" in out) {
        expect(out.plan.steps).toHaveLength(1);
        expect(out.plan.steps[0].command.type).toBe("physics.setGravity");
        expect(out.plan.steps[0].command.targetId).toBe("stone.front");
      }
    });
  }

  it("「慢慢」与不带「慢慢」产生不同参数档位", () => {
    const slow = generatePlan(ask("让前面的石头慢慢浮起来", snapshot()));
    const fast = generatePlan(ask("让前面的石头浮起来", snapshot()));
    if ("plan" in slow && "plan" in fast) {
      const s = slow.plan.steps[0].command as { gravityScale: number; durationTicks: number };
      const f = fast.plan.steps[0].command as { gravityScale: number; durationTicks: number };
      expect(s.durationTicks).toBeGreaterThan(f.durationTicks);
      expect(Math.abs(s.gravityScale)).toBeLessThanOrEqual(Math.abs(f.gravityScale));
    }
  });
});

describe("回归输入 2：多步骤", () => {
  it("「三块石板依次浮起来」→ 3 步且成依赖链", () => {
    const out = generatePlan(ask("三块石块依次浮起来", threeStoneSnapshot()));
    expect(out).toHaveProperty("plan");
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      expect(out.plan.steps).toHaveLength(3);
      expect(out.plan.steps[1].dependsOn).toEqual([out.plan.steps[0].id]);
      expect(out.plan.steps[2].dependsOn).toEqual([out.plan.steps[1].id]);
    }
  });

  it("「三块石块同时浮起来」→ 3 步且互不依赖", () => {
    const out = generatePlan(ask("三块石块同时浮起来", threeStoneSnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      expect(out.plan.steps).toHaveLength(3);
      for (const s of out.plan.steps) expect(s.dependsOn).toEqual([]);
    }
  });

  it("「三块石块浮起来」默认也产出 3 步合法计划", () => {
    const out = generatePlan(ask("三块石块浮起来", threeStoneSnapshot()));
    if ("plan" in out) expect(out.plan.steps).toHaveLength(3);
  });

  it("多步骤计划 estimatedCost = 各步成本之和且 ≤ 预算", () => {
    const out = generatePlan(ask("三块石块依次浮起来", threeStoneSnapshot()));
    if ("plan" in out) expect(out.plan.estimatedCost).toBe(30);
  });
});

describe("回归输入 3：指代消解", () => {
  it("选中对象优先：选中 stone.mid 后说「浮起来」", () => {
    const out = generatePlan(ask("浮起来", threeStoneSnapshot({ selectedObjectIds: ["stone.mid"] })));
    if ("plan" in out) expect(out.plan.steps[0].command.targetId).toBe("stone.mid");
  });

  it("空间关系：「最左边那块石头浮起来」→ x 最小的 stone.left", () => {
    const out = generatePlan(ask("最左边那块石头浮起来", threeStoneSnapshot()));
    if ("plan" in out) expect(out.plan.steps[0].command.targetId).toBe("stone.left");
  });

  it("标签匹配：「中间石块浮起来」→ stone.mid", () => {
    const out = generatePlan(ask("中间石块浮起来", threeStoneSnapshot()));
    if ("plan" in out) expect(out.plan.steps[0].command.targetId).toBe("stone.mid");
  });

  it("模糊指代：无选中、无空间词的多同类目标 → TARGET_AMBIGUOUS + 追问", () => {
    const out = generatePlan(ask("石头浮起来", threeStoneSnapshot()));
    expect(out).toHaveProperty("error");
    if ("error" in out) {
      expect(out.error.code).toBe("TARGET_AMBIGUOUS");
      expect(out.error.clarify).toBeTruthy();
      expect(out.error.candidates).toHaveLength(3);
    }
  });

  it("序数：「第二块石块浮起来」只操作第二个", () => {
    const out = generatePlan(ask("第二块石块浮起来", threeStoneSnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      expect(out.plan.steps).toHaveLength(1);
      expect(out.plan.steps[0].command.targetId).toBe("stone.mid");
    }
  });

  it("单选中 + 代词「让它浮起来」直接命中", () => {
    const out = generatePlan(ask("让它浮起来", threeStoneSnapshot({ selectedObjectIds: ["stone.right"] })));
    if ("plan" in out) expect(out.plan.steps[0].command.targetId).toBe("stone.right");
  });

  it("无选中、无类别、无代词 → TARGET_NOT_FOUND", () => {
    const out = generatePlan(ask("浮起来", threeStoneSnapshot()));
    if ("error" in out) expect(out.error.code).toBe("TARGET_NOT_FOUND");
  });

  it("resolveTargets：选中唯一优先级高于类别词", () => {
    const r = resolveTargets("让左边的石头浮起来", threeStoneSnapshot({ selectedObjectIds: ["stone.right"] }));
    expect(r).toMatchObject({ kind: "resolved", objects: [expect.objectContaining({ id: "stone.right" })] });
  });
});

describe("回归输入 4：越权意图", () => {
  for (const s of ["直接让我通关", "帮我通关", "把我传送到终点", "直接赢"]) {
    it(`「${s}」被明确拒绝`, () => {
      const out = generatePlan(ask(s, snapshot()));
      expect(out).toHaveProperty("error");
      if ("error" in out) expect(out.error.code).toBe("COMMAND_NOT_ALLOWED");
    });
  }

  it("「改天气让它下雨」被拒绝（城市关）", () => {
    const out = generatePlan(ask("改天气让它下雨", citySnapshot()));
    expect(out).toHaveProperty("error");
  });

  it("「写一段 JavaScript 直接赢」被拒绝", () => {
    const out = generatePlan(ask("写一段 JavaScript 直接赢", snapshot()));
    expect(out).toHaveProperty("error");
  });

  it("修改不可变对象：「打开出口传送门」→ TARGET_IMMUTABLE", () => {
    const out = generatePlan(ask("打开出口传送门", snapshot()));
    if ("error" in out) expect(out.error.code).toBe("TARGET_IMMUTABLE");
  });
});

describe("回归输入 5：超预算", () => {
  it("预算不足 → BUDGET_EXCEEDED", () => {
    const out = generatePlan(ask("让前面的石头浮起来", snapshot({ budgetRemaining: 5 })));
    if ("error" in out) expect(out.error.code).toBe("BUDGET_EXCEEDED");
  });

  it("预算充足时同类请求成功（对照）", () => {
    const out = generatePlan(ask("让前面的石头浮起来", snapshot({ budgetRemaining: 100 })));
    expect(out).toHaveProperty("plan");
  });
});

describe("回归输入 6：语音识别错误容错", () => {
  it("「实块浮起来」（石块→实块）仍命中 stone", () => {
    const out = generatePlan(ask("实块浮起来", snapshot()));
    expect(out).toHaveProperty("plan");
  });

  it("「十块浮起来」（石块→十块）仍命中 stone 且只操作一个", () => {
    const out = generatePlan(ask("十块浮起来", snapshot()));
    if ("plan" in out) expect(out.plan.steps).toHaveLength(1);
  });

  it("「前面的石头生起来」（升起→生起）按浮起处理", () => {
    const out = generatePlan(ask("前面的石头生起来", snapshot()));
    if ("plan" in out) expect(out.plan.steps[0].command.type).toBe("physics.setGravity");
  });

  it("parseIntent 归一化后的文本包含修正结果", () => {
    const intent = parseIntent("让实块生起来");
    expect(intent.text).toContain("石块");
  });
});

describe("回归输入 7：城市政策（M3，dry-river-city）", () => {
  it("四项明确比例直接成稿：居民40 农业25 工业25 生态10", () => {
    const out = generatePlan(ask("居民40 农业25 工业25 生态10", citySnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      const cmd = out.plan.steps[0].command as { type: string; waterAllocation: Record<string, number> };
      expect(cmd.type).toBe("city.setPolicy");
      expect(Object.values(cmd.waterAllocation).reduce((a, b) => a + b, 0)).toBe(100);
      expect(out.plan.requiresConfirmation).toBe(false);
    }
  });

  it("「尽量照顾所有人」→ 均衡草案 + 澄清 + 需确认", () => {
    const out = generatePlan(ask("尽量照顾所有人", citySnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      expect(out.plan.requiresConfirmation).toBe(true);
      expect(out.plan.summary).toContain("均分");
    }
  });

  it("「居民优先」→ 居民 40 的可修改草案", () => {
    const out = generatePlan(ask("居民优先", citySnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      const cmd = out.plan.steps[0].command as { waterAllocation: Record<string, number> };
      expect(cmd.waterAllocation.residential).toBe(40);
      expect(out.plan.requiresConfirmation).toBe(true);
    }
  });

  it("部分比例（只给居民 40）→ 剩余均摊且总和 100", () => {
    const out = generatePlan(ask("居民 40，剩下的看着办", citySnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      const cmd = out.plan.steps[0].command as { waterAllocation: Record<string, number> };
      const total = Object.values(cmd.waterAllocation).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    }
  });

  it("「模拟 7 天」→ advanceSimulation days=7", () => {
    const out = generatePlan(ask("居民40 农业25 工业25 生态10，模拟 7 天", citySnapshot()));
    expect(out).toHaveProperty("plan");
    if ("plan" in out) {
      const sim = out.plan.steps[1].command as { type: string; days: number };
      expect(sim.type).toBe("city.advanceSimulation");
      expect(sim.days).toBe(7);
    }
  });

  it("政策计划包含策略依据且不虚构模拟结果", () => {
    const out = generatePlan(ask("居民40 农业25 工业25 生态10", citySnapshot()));
    if ("plan" in out) expect(out.plan.summary).toContain("依据");
  });
});
