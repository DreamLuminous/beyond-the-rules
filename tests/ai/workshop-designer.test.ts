import { describe, expect, it } from "vitest";
import {
  designWorkshopLevel,
  interpretBrief,
  redesignWithFeedback
} from "../../apps/web/src/integration/workshopDesigner";

const LIGHT_BRIEF = "我想玩一关需要反射光线的挑战，有点难";

describe("AI workshop designer", () => {
  it("turns a Chinese brief into a validated level draft", () => {
    const outcome = designWorkshopLevel(LIGHT_BRIEF, { seed: 42 });
    expect(outcome.draft.name).toContain("回声工坊");
    expect(outcome.validation.ok).toBe(true);
    expect(outcome.validation.solvable).toBe(true);
    expect(outcome.validation.solution?.pathLength).toBeGreaterThan(0);
    expect(outcome.validation.solution?.gatesOpened.length).toBe(2);
    expect(outcome.explanation).toContain("验证器");
  });

  it("is deterministic for the same seed and brief", () => {
    const first = designWorkshopLevel(LIGHT_BRIEF, { seed: 7 });
    const second = designWorkshopLevel(LIGHT_BRIEF, { seed: 7 });
    expect(first.draft).toEqual(second.draft);
    expect(first.validation).toEqual(second.validation);
  });

  it("validates every generated seed across all difficulties", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const brief = { easy: "简单一点", normal: "正常难度", hard: "我想挑战难一点的" }[difficulty];
      for (let seed = 1; seed <= 12; seed += 1) {
        const outcome = designWorkshopLevel(brief, { seed });
        expect(outcome.requirements.difficulty).toBe(difficulty);
        expect(outcome.validation.ok, `seed ${seed} (${difficulty})`).toBe(true);
      }
    }
  });

  it("adds a reachable hidden record when asked", () => {
    const outcome = designWorkshopLevel("要一点难的，最好有隐藏区域", { seed: 11 });
    const log = outcome.draft.objects.find(object => object.kind === "log");
    expect(log).toBeDefined();
    expect(outcome.validation.checks.find(check => check.id === "hidden")?.ok).toBe(true);
  });

  it("explains unsupported mechanics instead of pretending they exist", () => {
    const requirements = interpretBrief("我想要有敌人追逐和联机的关卡");
    expect(requirements.unsupported.length).toBeGreaterThanOrEqual(2);
    const outcome = designWorkshopLevel("我想要有敌人追逐和联机的关卡", { seed: 3 });
    expect(outcome.validation.ok).toBe(true);
    expect(outcome.explanation).toContain("还没有这些能力");
  });

  it("applies feedback to the next revision", () => {
    const first = designWorkshopLevel("正常难度", { seed: 5 });
    const easier = redesignWithFeedback(first, "太难了，有地方跳不过去");
    expect(easier.requirements.difficulty).toBe("easy");
    expect(easier.revisions).toBe(first.revisions + 1);
    expect(easier.validation.ok).toBe(true);

    const hidden = redesignWithFeedback(first, "想要隐藏区域，但别太难");
    expect(hidden.requirements.hidden).toBe(true);
    expect(hidden.validation.ok).toBe(true);
  });
});
