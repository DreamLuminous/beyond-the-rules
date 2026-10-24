import { describe, expect, it } from "vitest";
import { RuleScriptSchema, type RuleScript } from "@btr/contracts";
import { designCityScript } from "../../apps/web/src/integration/cityDesigner";
import { runCitySimulation } from "../../apps/web/src/game/city/runner";

function naiveScript(): RuleScript {
  return RuleScriptSchema.parse({
    version: 1,
    id: "rule.naive",
    name: "固定配水",
    rules: [
      {
        id: "rule.always-default",
        when: { type: "always" },
        then: [
          {
            type: "city.setPolicy",
            waterAllocation: { residential: 35, agriculture: 25, industry: 22, ecology: 18 },
            irrigationWindow: "balanced",
            industryCap: 80
          },
          { type: "city.setIrrigation", enabled: true, minimumReserve: 20 }
        ],
        once: false
      }
    ]
  });
}

describe("city simulation", () => {
  it("is deterministic for the same rules and options", () => {
    const script = designCityScript("缺水时先保居民，再限制工业", { seed: 11 }).script;
    const first = runCitySimulation(script, { exploredSparePump: false });
    const second = runCitySimulation(script, { exploredSparePump: false });
    expect(first).toEqual(second);
    expect(first.reports).toHaveLength(7);
    expect(first.reports[2]?.weather).toBe("drought");
    expect(first.reports[4]?.events.join(" ")).toContain("泵站故障");
  });

  it("passes with an adaptive resident-first policy", () => {
    const script = designCityScript("缺水时先保居民，再限制工业", { seed: 5 }).script;
    const assessment = runCitySimulation(script, { exploredSparePump: false });
    console.log("ADAPTIVE", JSON.stringify({
      passed: assessment.passed,
      failures: assessment.failures,
      avgRes: assessment.averageResidentialSupply,
      minEnergy: Math.min(...assessment.reports.map(report => report.energyReliability)),
      minEco: assessment.minEcologyIndex,
      minReservoir: assessment.minimumReservoir,
      rules: assessment.reports.map(report => report.activeRuleId)
    }));
    expect(assessment.passed).toBe(true);
  });

  it("fails a fixed policy that never adapts during the pump failure", () => {
    const assessment = runCitySimulation(naiveScript(), { exploredSparePump: false });
    console.log("NAIVE", JSON.stringify({
      passed: assessment.passed,
      failures: assessment.failures,
      minEnergy: Math.min(...assessment.reports.map(report => report.energyReliability))
    }));
    expect(assessment.passed).toBe(false);
    expect(assessment.failures.join(" ")).toContain("能源");
  });

  it("only honours the spare pump when the player has found it", () => {
    const script = RuleScriptSchema.parse({
      version: 1,
      id: "rule.spare",
      name: "备用泵",
      rules: [
        {
          id: "rule.always",
          when: { type: "always" },
          then: [
            {
              type: "city.setPolicy",
              waterAllocation: { residential: 35, agriculture: 25, industry: 22, ecology: 18 },
              irrigationWindow: "balanced",
              industryCap: 80
            },
            { type: "city.setIrrigation", enabled: true, minimumReserve: 20 },
            { type: "city.setFacility", facilityId: "pump.spare", enabled: true }
          ],
          once: false
        }
      ]
    });
    expect(runCitySimulation(script, { exploredSparePump: false }).passed).toBe(false);
    expect(runCitySimulation(script, { exploredSparePump: true }).passed).toBe(true);
  });

  it("reports exact daily numbers instead of trusting the model", () => {
    const script = designCityScript("保居民", { seed: 5 }).script;
    const assessment = runCitySimulation(script, { exploredSparePump: false });
    for (const report of assessment.reports) {
      expect(Number.isFinite(report.reservoir)).toBe(true);
      expect(report.residentialSupply).toBeGreaterThanOrEqual(0);
      expect(report.energyReliability).toBeLessThanOrEqual(100);
    }
  });
});
