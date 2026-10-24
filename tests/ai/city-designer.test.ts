import { describe, expect, it } from "vitest";
import {
  designCityScript,
  interpretCityBrief,
  reviseCityScript
} from "../../apps/web/src/integration/cityDesigner";
import { runCitySimulation } from "../../apps/web/src/game/city/runner";

const BRIEF = "缺水的时候先保居民生活用水，再限制工业，也要给下游留一点生态流量";

describe("AI city policy designer", () => {
  it("turns a Chinese brief into a runnable rule script", () => {
    const outcome = designCityScript(BRIEF, { seed: 5 });
    expect(outcome.script.rules.length).toBeGreaterThanOrEqual(3);
    expect(outcome.views.length).toBe(outcome.script.rules.length);
    expect(outcome.code).toContain("WHEN");
    expect(outcome.explanation).toContain("居民");
    expect(runCitySimulation(outcome.script, { exploredSparePump: false }).passed).toBe(true);
  });

  it("is deterministic for the same brief and seed", () => {
    const first = designCityScript(BRIEF, { seed: 9 });
    const second = designCityScript(BRIEF, { seed: 9 });
    expect(first.script).toEqual(second.script);
    expect(first.views).toEqual(second.views);
  });

  it("explains unsupported requests instead of inventing new water", () => {
    const requirements = interpretCityBrief("建一座海水淡化厂，再人工降雨");
    expect(requirements.unsupported.length).toBeGreaterThanOrEqual(1);
    const outcome = designCityScript("建一座海水淡化厂，再人工降雨", { seed: 2 });
    expect(outcome.explanation).toContain("超出了本关能力");
  });

  it("applies feedback: simpler rules, stronger resident priority", () => {
    const first = designCityScript(BRIEF, { seed: 5 });
    const simpler = reviseCityScript(first, "规则太多了，简单一点", { exploredSparePump: false });
    expect(simpler.script.rules.map(rule => rule.id)).not.toContain("rule.dry-farmland");
    expect(simpler.revisions).toBe(first.revisions + 1);

    const resident = reviseCityScript(first, "居民供水还是不够", { exploredSparePump: false });
    expect(resident.requirements.protectResidents).toBe(true);
    expect(runCitySimulation(resident.script, { exploredSparePump: false }).passed).toBe(true);
  });

  it("requires exploration before the spare pump can enter the rules", () => {
    const first = designCityScript(BRIEF, { seed: 5 });
    const locked = reviseCityScript(first, "用备用泵顶上", { exploredSparePump: false });
    expect(locked.requirements.useSparePump).toBe(false);
    expect(locked.changes.join(" ")).toContain("巡查泵站");

    const unlocked = reviseCityScript(first, "用备用泵顶上", { exploredSparePump: true });
    expect(unlocked.requirements.useSparePump).toBe(true);
    const hasSpare = unlocked.script.rules.some(rule =>
      rule.then.some(command => command.type === "city.setFacility" && command.facilityId === "pump.spare")
    );
    expect(hasSpare).toBe(true);
    expect(runCitySimulation(unlocked.script, { exploredSparePump: true }).passed).toBe(true);
  });
});
