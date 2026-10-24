import { describe, expect, it } from "vitest";
import { LevelDraftSchema, RuleScriptSchema } from "@btr/contracts";

describe("shared creation contracts", () => {
  it("accepts a bounded level draft for the world builder", () => {
    const result = LevelDraftSchema.safeParse({
      version: 1,
      id: "level.echo-workshop",
      name: "回声工坊",
      size: { width: 1800, height: 720 },
      spawn: { x: 120, y: 520 },
      objective: "抵达出口",
      constraints: ["保留至少一条安全路线"],
      objects: [{ id: "platform.start", kind: "platform", position: { x: 0, y: 560 } }],
      successConditions: ["agent reaches exit.portal"]
    });
    expect(result.success).toBe(true);
  });

  it("accepts compound city rules with whitelisted actions", () => {
    const result = RuleScriptSchema.safeParse({
      version: 1,
      id: "rule.city-test",
      name: "城市规则",
      rules: [
        {
          id: "rule.emergency",
          when: {
            type: "all",
            conditions: [
              { type: "objectState", targetId: "reservoir", property: "level", operator: "lessThan", value: 30 },
              { type: "objectState", targetId: "weather", property: "drought", operator: "equals", value: true }
            ]
          },
          then: [
            {
              type: "city.setPolicy",
              waterAllocation: { residential: 55, agriculture: 12, industry: 8, ecology: 25 },
              irrigationWindow: "balanced",
              industryCap: 20
            },
            { type: "city.setIrrigation", enabled: false, minimumReserve: 20 },
            { type: "city.setFacility", facilityId: "pump.spare", enabled: true }
          ],
          once: false
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("accepts only declarative commands in RuleScript", () => {
    const safe = RuleScriptSchema.safeParse({
      version: 1,
      id: "rule.raise-bridge",
      name: "启动辅助桥",
      rules: [{
        id: "activate-on-pressure",
        when: { type: "objectState", targetId: "pressure.plate", property: "pressed", operator: "equals", value: true },
        then: [{ type: "mechanism.setState", targetId: "bridge.auxiliary", state: "on" }],
        once: true
      }]
    });
    const unsafe = RuleScriptSchema.safeParse({
      version: 1,
      id: "rule.unsafe",
      name: "任意脚本",
      rules: [{ id: "run-code", when: { type: "always" }, then: [{ type: "javascript.eval", code: "alert(1)" }] }]
    });
    expect(safe.success).toBe(true);
    expect(unsafe.success).toBe(false);
  });
});
