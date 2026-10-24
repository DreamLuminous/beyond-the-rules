import { RuleScriptSchema, type RuleScript, type WorldCommand } from "@btr/contracts";
import { ruleCode, ruleViews, type RuleView } from "../game/city/runner";

export type CityRequirements = {
  protectResidents: boolean;
  protectEcology: boolean;
  saveWater: boolean;
  useSparePump: boolean;
  simple: boolean;
  summary: string;
  unsupported: string[];
};

export type CityDesignOutcome = {
  script: RuleScript;
  requirements: CityRequirements;
  explanation: string;
  views: RuleView[];
  code: string;
  seed: number;
  revisions: number;
  changes: string[];
};

const UNSUPPORTED: { pattern: RegExp; missing: string }[] = [
  { pattern: /海水淡化|新建水库|调水工程|增加来水|人工降雨/, missing: "新建水源工程（本关只能调度现有水量）" },
  { pattern: /天气控制|改变天气/, missing: "天气控制（干旱是确定性事件）" },
  { pattern: /价格|市场|税收/, missing: "经济与价格系统" }
];

export function interpretCityBrief(brief: string): CityRequirements {
  const text = brief.trim();
  const unsupported: string[] = [];
  for (const rule of UNSUPPORTED) {
    if (rule.pattern.test(text)) unsupported.push(rule.missing);
  }
  return {
    protectResidents: /居民|生活用水|保居民|优先居民/.test(text),
    protectEcology: /生态|下游|河流|环境/.test(text),
    saveWater: /节水|限工|限制工业|缺水|调度/.test(text),
    useSparePump: /备用泵|备用|维护记录|泵站/.test(text),
    simple: /简单|别太复杂|少一点规则|规则少/.test(text),
    summary: text.length > 0 ? text.slice(0, 120) : "在干旱和泵站故障下保住居民供水与能源稳定",
    unsupported
  };
}

function policy(
  residential: number,
  agriculture: number,
  industry: number,
  ecology: number,
  industryCap: number
): WorldCommand {
  return {
    type: "city.setPolicy",
    waterAllocation: { residential, agriculture, industry, ecology },
    irrigationWindow: "balanced",
    industryCap
  };
}

function irrigation(enabled: boolean, minimumReserve = 20): WorldCommand {
  return { type: "city.setIrrigation", enabled, minimumReserve };
}

function sparePump(): WorldCommand {
  return { type: "city.setFacility", facilityId: "pump.spare", enabled: true };
}

export function buildCityScript(requirements: CityRequirements, seed: number): RuleScript {
  const emergencyResidential = requirements.protectResidents ? 55 : 50;
  const emergencyEcology = requirements.protectEcology ? 25 : 25;
  const emergencyAgriculture = requirements.saveWater ? 12 : 15;
  const emergencyIndustry = 100 - emergencyResidential - emergencyEcology - emergencyAgriculture;
  const threshold = 30 + (seed % 3);
  const spare = requirements.useSparePump ? [sparePump()] : [];

  const rules: RuleScript["rules"] = [
    {
      id: "rule.emergency",
      when: {
        type: "all",
        conditions: [
          {
            type: "objectState",
            targetId: "reservoir",
            property: "level",
            operator: "lessThan",
            value: threshold
          }
        ]
      },
      then: [
        policy(
          emergencyResidential,
          emergencyAgriculture,
          emergencyIndustry,
          emergencyEcology,
          requirements.saveWater ? 20 : 25
        ),
        irrigation(false),
        ...spare
      ],
      once: false
    },
    {
      id: "rule.pump-failure",
      when: {
        type: "objectState",
        targetId: "facility",
        property: "pumpB.enabled",
        operator: "equals",
        value: false
      },
      then: [policy(45, 20, 15, 20, 30), irrigation(false), ...spare],
      once: false
    },
    {
      id: "rule.drought",
      when: {
        type: "objectState",
        targetId: "weather",
        property: "drought",
        operator: "equals",
        value: true
      },
      then: [policy(42, 24, 18, 16, 55), irrigation(true, 15)],
      once: false
    }
  ];

  if (!requirements.simple) {
    rules.push({
      id: "rule.dry-farmland",
      when: {
        type: "objectState",
        targetId: "farmland",
        property: "moisture",
        operator: "lessThan",
        value: 35
      },
      then: [policy(40, 30, 18, 12, 65), irrigation(true, 20)],
      once: false
    });
  }

  const defaultResidential = requirements.protectResidents ? 38 : 35;
  const defaultAgriculture = requirements.protectEcology ? 22 : 25;
  const defaultEcology = requirements.protectResidents ? 22 : requirements.protectEcology ? 20 : 18;
  const defaultIndustry = 100 - defaultResidential - defaultAgriculture - defaultEcology;

  rules.push({
    id: "rule.default",
    when: { type: "always" },
    then: [
      policy(defaultResidential, defaultAgriculture, defaultIndustry, defaultEcology, 80),
      irrigation(true, 20)
    ],
    once: false
  });

  return RuleScriptSchema.parse({
    version: 1,
    id: `rule.city-${seed}`,
    name: "断流之城 · 自动供水规则",
    rules
  });
}

function explain(requirements: CityRequirements, seed: number): string {
  const parts: string[] = [];
  parts.push(
    requirements.protectResidents
      ? "我把居民生活用水放在第一位：水库低于警戒线时，居民保留最大份额，工业和灌溉先让路。"
      : "我按「先保基本供水、再压工业」的顺序写了三到四条规则：水库告急、泵站故障、干旱各有独立策略。"
  );
  if (requirements.protectEcology) parts.push("生态流量保留了下限，不会为了保供把下游抽干。");
  if (requirements.saveWater) parts.push("工业上限压得更低，用产量换取水库安全。");
  if (requirements.useSparePump) parts.push("规则里会尝试启用备用泵；前提是你在城里找到它的维护记录。");
  if (requirements.simple) parts.push("按你的要求，我去掉了农田湿度那条规则，只保留三个主要场景。");
  if (requirements.unsupported.length > 0) {
    parts.push(`你提到的${requirements.unsupported.join("、")}超出了本关能力，我只能用现有水量和设施调度来实现。`);
  }
  parts.push(`规则编号 ${seed}。运行结果由城市模拟器逐日计算，不会由我代填。`);
  return parts.join("");
}

export function designCityScript(
  brief: string,
  options: {
    seed?: number;
    revisions?: number;
    changes?: string[];
    requirements?: CityRequirements;
  } = {}
): CityDesignOutcome {
  const requirements = options.requirements ?? interpretCityBrief(brief);
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const script = buildCityScript(requirements, seed);
  return {
    script,
    requirements,
    explanation: explain(requirements, seed),
    views: ruleViews(script),
    code: ruleCode(script),
    seed,
    revisions: options.revisions ?? 1,
    changes: options.changes ?? []
  };
}

export function reviseCityScript(
  previous: CityDesignOutcome,
  feedback: string,
  options: { exploredSparePump: boolean }
): CityDesignOutcome {
  const requirements: CityRequirements = {
    ...previous.requirements,
    unsupported: [...previous.requirements.unsupported]
  };
  const changes: string[] = [];

  if (/居民|供水不足|缺水/.test(feedback)) {
    requirements.protectResidents = true;
    changes.push("把居民份额提到最高优先级");
  }
  if (/生态|下游|河流/.test(feedback)) {
    requirements.protectEcology = true;
    changes.push("保留生态流量下限");
  }
  if (/工业|节水|限工/.test(feedback)) {
    requirements.saveWater = true;
    changes.push("进一步压低工业上限");
  }
  if (/简单|复杂|规则太多/.test(feedback)) {
    requirements.simple = true;
    changes.push("删掉农田湿度规则，只保留三个主场景");
  }
  if (/备用泵|备用|维护记录/.test(feedback)) {
    if (options.exploredSparePump) {
      requirements.useSparePump = true;
      changes.push("在告急与故障规则中加入启用备用泵");
    } else {
      changes.push("还没有找到备用泵：先去城里巡查泵站，再让我加这条规则");
    }
  }

  if (changes.length === 0) changes.push("保留原有规则，只按新编号重新生成");

  const seed = (previous.seed * 31 + 17) % 2_147_483_647;
  const outcome = designCityScript(requirements.summary, {
    seed,
    revisions: previous.revisions + 1,
    changes,
    requirements
  });
  return {
    ...outcome,
    explanation: `根据你的反馈，我${changes.join("、")}。${outcome.explanation}`
  };
}
