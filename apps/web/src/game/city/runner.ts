import {
  CityAssessmentSchema,
  RuleScriptSchema,
  type CityAssessment,
  type CityDayReport,
  type RuleCondition,
  type RuleScript,
  type WorldCommand
} from "@btr/contracts";
import {
  CITY_DAYS,
  DEFAULT_POLICY,
  createCityState,
  scheduleForDay,
  simulateCityDay,
  type CityPolicy,
  type CityRuntimeState
} from "./model";

export type CityRunOptions = {
  exploredSparePump?: boolean;
};

type Facts = Record<string, string | number | boolean>;

export const FALLBACK_RULE_ID = "rule.fallback";

export function conditionFacts(
  state: CityRuntimeState,
  day: number,
  exploredSparePump: boolean
): Facts {
  const schedule = scheduleForDay(day);
  return {
    "day.number": day,
    "reservoir.level": round(state.reservoir),
    "reservoir.inflow": schedule.inflow,
    "farmland.moisture": round(state.soilMoisture),
    "residents.supply": round(state.lastResidentialSupply),
    "energy.reliability": round(state.lastEnergyReliability),
    "ecology.index": round(state.ecologyIndex),
    "weather.drought": schedule.weather === "drought",
    "facility.pumpB.enabled": !schedule.pumpFailure,
    "facility.spare.enabled": exploredSparePump
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function compare(actual: string | number | boolean, operator: "equals" | "greaterThan" | "lessThan", expected: string | number | boolean): boolean {
  if (operator === "equals") return actual === expected;
  if (typeof actual === "number" && typeof expected === "number") {
    return operator === "greaterThan" ? actual > expected : actual < expected;
  }
  return false;
}

export function matchesCondition(condition: RuleCondition, facts: Facts): boolean {
  if (condition.type === "always") return true;
  if (condition.type === "timer") return false;
  if (condition.type === "all") return condition.conditions.every(leaf => matchesCondition(leaf, facts));
  if (condition.type === "any") return condition.conditions.some(leaf => matchesCondition(leaf, facts));

  const actual = facts[`${condition.targetId}.${condition.property}`];
  if (actual === undefined) return false;
  return compare(actual, condition.operator, condition.value);
}

export function policyFromCommands(commands: WorldCommand[], exploredSparePump: boolean): CityPolicy {
  const policy: CityPolicy = {
    ...DEFAULT_POLICY,
    share: { ...DEFAULT_POLICY.share }
  };

  for (const command of commands) {
    if (command.type === "city.setPolicy") {
      policy.share = { ...command.waterAllocation };
      policy.industryCap = command.industryCap;
      policy.irrigation = true;
    } else if (command.type === "city.setIrrigation") {
      policy.irrigation = command.enabled;
      policy.minimumReserve = command.minimumReserve;
    } else if (command.type === "city.setFacility") {
      if (command.facilityId === "pump.spare") {
        policy.sparePump = command.enabled && exploredSparePump;
      }
    }
  }

  return policy;
}

export function runCitySimulation(script: RuleScript, options: CityRunOptions = {}): CityAssessment {
  const parsed = RuleScriptSchema.parse(script);
  const exploredSparePump = options.exploredSparePump ?? false;
  const fired = new Set<string>();
  const reports: CityDayReport[] = [];
  let state = createCityState(exploredSparePump);

  for (let day = 1; day <= CITY_DAYS; day += 1) {
    const facts = conditionFacts(state, day, exploredSparePump);
    const rule = parsed.rules.find(candidate => {
      if (candidate.once && fired.has(candidate.id)) return false;
      return matchesCondition(candidate.when, facts);
    });

    const activeRuleId = rule?.id ?? FALLBACK_RULE_ID;
    const policy = rule
      ? policyFromCommands(rule.then as WorldCommand[], exploredSparePump)
      : { ...DEFAULT_POLICY, share: { ...DEFAULT_POLICY.share } };
    if (rule?.once) fired.add(rule.id);

    const outcome = simulateCityDay(state, policy, day, activeRuleId);
    reports.push(outcome.report);
    state = outcome.next;
  }

  const averageResidentialSupply =
    reports.reduce((total, report) => total + report.residentialSupply, 0) / reports.length;
  const averageEnergyReliability =
    reports.reduce((total, report) => total + report.energyReliability, 0) / reports.length;
  const minEcologyIndex = Math.min(...reports.map(report => report.ecologyIndex));
  const minimumReservoir = Math.min(...reports.map(report => report.reservoir));

  const failures: string[] = [];
  if (averageResidentialSupply < 90) failures.push("居民平均供水低于 90%");
  for (const report of reports) {
    if (report.energyReliability < 75) {
      failures.push(`第 ${report.day} 天能源可靠性只有 ${Math.round(report.energyReliability)}%`);
    }
  }
  if (minEcologyIndex < 60) failures.push("生态指数跌破 60");
  if (minimumReservoir <= 0.5) failures.push("水库见底");

  return CityAssessmentSchema.parse({
    passed: failures.length === 0,
    days: reports.length,
    averageResidentialSupply: round(averageResidentialSupply),
    averageEnergyReliability: round(averageEnergyReliability),
    minEcologyIndex: round(minEcologyIndex),
    minimumReservoir: round(minimumReservoir),
    failures,
    reports
  });
}

export type RuleView = {
  id: string;
  condition: string;
  actions: string[];
};

const SECTOR_LABEL: Record<string, string> = {
  residential: "居民",
  agriculture: "农业",
  industry: "工业",
  ecology: "生态"
};

const FACT_LABEL: Record<string, string> = {
  "reservoir.level": "水库水位",
  "reservoir.inflow": "当日来水",
  "farmland.moisture": "农田湿度",
  "residents.supply": "居民供水",
  "energy.reliability": "能源可靠性",
  "ecology.index": "生态指数",
  "day.number": "天数",
  "weather.drought": "干旱",
  "facility.pumpB.enabled": "主泵可用",
  "facility.spare.enabled": "备用泵已解锁"
};

function conditionText(condition: RuleCondition): string {
  if (condition.type === "always") return "每天";
  if (condition.type === "timer") return "计时条件（城市规则不使用）";
  if (condition.type === "all") return condition.conditions.map(conditionText).join(" 且 ");
  if (condition.type === "any") return condition.conditions.map(conditionText).join(" 或 ");

  const name = FACT_LABEL[`${condition.targetId}.${condition.property}`] ?? `${condition.targetId}.${condition.property}`;
  const operator = condition.operator === "greaterThan" ? ">" : condition.operator === "lessThan" ? "<" : "=";
  const value = typeof condition.value === "boolean" ? (condition.value ? "是" : "否") : String(condition.value);
  return `${name} ${operator} ${value}`;
}

export function ruleViews(script: RuleScript): RuleView[] {
  return script.rules.map(rule => ({
    id: rule.id,
    condition: conditionText(rule.when),
    actions: rule.then.map(command => {
      if (command.type === "city.setPolicy") {
        const share = command.waterAllocation;
        return `配水 ${SECTOR_LABEL.residential} ${share.residential}% · ${SECTOR_LABEL.agriculture} ${share.agriculture}% · ${SECTOR_LABEL.industry} ${share.industry}% · ${SECTOR_LABEL.ecology} ${share.ecology}%，工业上限 ${command.industryCap}%`;
      }
      if (command.type === "city.setIrrigation") {
        return command.enabled ? `开启灌溉（水库需高于 ${command.minimumReserve}）` : "停止灌溉";
      }
      if (command.type === "city.setFacility") {
        return `${command.facilityId === "pump.spare" ? "备用泵" : command.facilityId} ${command.enabled ? "启用" : "停用"}`;
      }
      return command.type;
    })
  }));
}

export function ruleCode(script: RuleScript): string {
  const lines: string[] = [];
  for (const rule of script.rules) {
    lines.push(`WHEN ${conditionCode(rule.when)} THEN`);
    for (const command of rule.then) lines.push(`  ${commandCode(command)}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function conditionCode(condition: RuleCondition): string {
  if (condition.type === "always") return "true";
  if (condition.type === "timer") return "timer";
  if (condition.type === "all") return condition.conditions.map(conditionCode).join(" AND ");
  if (condition.type === "any") return condition.conditions.map(conditionCode).join(" OR ");
  const symbol = condition.operator === "greaterThan" ? ">" : condition.operator === "lessThan" ? "<" : "==";
  return `${condition.targetId}.${condition.property} ${symbol} ${JSON.stringify(condition.value)}`;
}

function commandCode(command: WorldCommand): string {
  if (command.type === "city.setPolicy") {
    const { residential, agriculture, industry, ecology } = command.waterAllocation;
    return `allocate(居民 ${residential}%, 农业 ${agriculture}%, 工业 ${industry}%, 生态 ${ecology}%) + capIndustry(${command.industryCap}%)`;
  }
  if (command.type === "city.setIrrigation") {
    return command.enabled ? `irrigate(minimumReserve=${command.minimumReserve})` : "irrigate(off)";
  }
  if (command.type === "city.setFacility") {
    return `facility(${command.facilityId}, ${command.enabled ? "on" : "off"})`;
  }
  return command.type;
}
