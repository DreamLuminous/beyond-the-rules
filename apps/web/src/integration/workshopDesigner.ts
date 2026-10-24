import {
  LevelDraftSchema,
  type LevelDraft,
  type LevelObject,
  type LevelValidation
} from "@btr/contracts";
import { CELL } from "../game/workshop/grid";
import { validateLevelDraft } from "../game/workshop/validator";

export type WorkshopDifficulty = "easy" | "normal" | "hard";

export type WorkshopRequirements = {
  difficulty: WorkshopDifficulty;
  hidden: boolean;
  hints: boolean;
  summary: string;
  unsupported: string[];
};

export type DesignOutcome = {
  draft: LevelDraft;
  validation: LevelValidation;
  requirements: WorkshopRequirements;
  explanation: string;
  seed: number;
  attempts: number;
  revisions: number;
  feedbackApplied: string[];
};

const DIFFICULTY_LABEL: Record<WorkshopDifficulty, string> = {
  easy: "轻松",
  normal: "标准",
  hard: "困难"
};

const UNSUPPORTED: { pattern: RegExp; missing: string }[] = [
  { pattern: /敌人|怪物|追逐|战斗|boss/i, missing: "敌人与追逐行为（当前工坊只有光路、镜面和闸门）" },
  { pattern: /联机|多人|好友|排行榜/i, missing: "多人联机与排行榜" },
  { pattern: /水|洪水|下雨|天气/i, missing: "天气与水资源系统（第三关才会开放）" },
  { pattern: /计时|倒计时|限时/i, missing: "限时挑战" },
  { pattern: /剧情|对话分支|结局/i, missing: "分支剧情" },
  { pattern: /飞行|游泳|攀爬/i, missing: "新的移动能力" }
];

export function interpretBrief(brief: string): WorkshopRequirements {
  const text = brief.trim();
  const unsupported: string[] = [];
  for (const rule of UNSUPPORTED) {
    if (rule.pattern.test(text)) unsupported.push(rule.missing);
  }

  let difficulty: WorkshopDifficulty = "normal";
  if (/正常|普通|标准/.test(text)) difficulty = "normal";
  else if (/难|困难|挑战|烧脑|hard|不要太简单/i.test(text)) difficulty = "hard";
  else if (/简单|轻松|easy|新手|别太复杂/i.test(text)) difficulty = "easy";

  const hidden = /隐藏|秘密|密室|彩蛋|秘密房间/.test(text);
  const hints = /提示|看不懂|不清楚|指导/.test(text);

  return {
    difficulty,
    hidden,
    hints,
    summary: text.length > 0 ? text.slice(0, 120) : "一个需要光路与跳跃的工坊挑战",
    unsupported
  };
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cellX = (col: number) => col * CELL + CELL / 2;
const cellY = (row: number) => row * CELL + CELL / 2;

function platform(id: string, fromCol: number, toCol: number, row: number): LevelObject {
  const width = (toCol - fromCol + 1) * CELL;
  return {
    id,
    kind: "platform",
    position: { x: fromCol * CELL + width / 2, y: cellY(row) },
    size: { width, height: CELL },
    properties: {}
  };
}

function block(id: string, col: number, topRow: number, bottomRow: number, kind: string): LevelObject {
  const height = (bottomRow - topRow + 1) * CELL;
  return {
    id,
    kind,
    position: { x: cellX(col), y: topRow * CELL + height / 2 },
    size: { width: CELL, height },
    properties: {}
  };
}

export function buildWorkshopDraft(requirements: WorkshopRequirements, seed: number): LevelDraft {
  const random = mulberry32(seed);
  const gap = requirements.difficulty === "easy" ? 2 : 3;
  const roomStart = 6 + gap;
  const mirrorOne = roomStart + 2 + Math.floor(random() * 2);
  const gateOne = 15 + Math.floor(random() * 2);
  const gateTwo = gateOne + 5;
  const pit = requirements.difficulty === "hard" ? mirrorOne + 2 : null;

  const objects: LevelObject[] = [
    platform("floor.start", 0, 5, 10),
    block("wall.gate-1", gateOne, 0, 7, "platform"),
    block("wall.gate-2", gateTwo, 0, 7, "platform"),
    {
      id: "gate-1",
      kind: "gate",
      position: { x: cellX(gateOne), y: 540 },
      size: { width: CELL, height: CELL * 2 },
      properties: { receiverId: "receiver-1" }
    },
    {
      id: "gate-2",
      kind: "gate",
      position: { x: cellX(gateTwo), y: 540 },
      size: { width: CELL, height: CELL * 2 },
      properties: { receiverId: "receiver-2" }
    },
    {
      id: "exit.portal",
      kind: "exit",
      position: { x: cellX(27), y: cellY(9) },
      size: { width: 48, height: 84 },
      properties: {}
    }
  ];

  if (pit === null) {
    objects.push(platform("floor.main", roomStart, 29, 10));
  } else {
    objects.push(platform("floor.main-a", roomStart, pit - 1, 10));
    objects.push(platform("floor.main-b", pit + 1, 29, 10));
  }

  objects.push(
    {
      id: "emitter-1",
      kind: "emitter",
      position: { x: cellX(roomStart), y: cellY(9) },
      size: { width: 36, height: 36 },
      properties: { direction: "right" }
    },
    {
      id: "emitter-2",
      kind: "emitter",
      position: { x: cellX(17), y: cellY(9) },
      size: { width: 36, height: 36 },
      properties: { direction: "right" }
    },
    {
      id: "mirror-1",
      kind: "mirror",
      position: { x: cellX(mirrorOne), y: cellY(9) },
      size: { width: 46, height: 46 },
      properties: { orientation: "\\", ...(requirements.hints ? { hint: true } : {}) }
    },
    {
      id: "mirror-2",
      kind: "mirror",
      position: { x: cellX(19), y: cellY(9) },
      size: { width: 46, height: 46 },
      properties: { orientation: "\\", ...(requirements.hints ? { hint: true } : {}) }
    },
    {
      id: "receiver-1",
      kind: "receiver",
      position: { x: cellX(mirrorOne), y: cellY(4) },
      size: { width: 46, height: 46 },
      properties: { gateId: "gate-1" }
    },
    {
      id: "receiver-2",
      kind: "receiver",
      position: { x: cellX(19), y: cellY(4) },
      size: { width: 46, height: 46 },
      properties: { gateId: "gate-2" }
    }
  );

  if (requirements.hidden) {
    objects.push(
      platform("hidden.ledge", 24, 24, 8),
      platform("hidden.shelf", 25, 26, 6),
      {
        id: "log.echo",
        kind: "log",
        position: { x: cellX(25), y: cellY(5) },
        size: { width: 28, height: 28 },
        properties: {}
      }
    );
  }

  const name = requirements.hidden ? "回声工坊 · 光路与密室" : "回声工坊 · 双闸光路";
  return LevelDraftSchema.parse({
    version: 1,
    id: `level.workshop-${seed}`,
    name,
    size: { width: 1800, height: 720 },
    spawn: { x: cellX(1), y: cellY(9) },
    objective: "转动两面镜子，让两个接收器同时亮起，穿过两道闸门抵达出口。",
    constraints: ["只使用镜面、光路与闸门", "不能破坏固定地形", "隐藏记录不强制收集"],
    objects,
    successConditions: ["player.reaches(exit.portal)", "receiver-1.lit", "receiver-2.lit"]
  });
}

function describe(requirements: WorkshopRequirements, validation: LevelValidation, seed: number): string {
  const parts: string[] = [];
  parts.push(
    `我按「${DIFFICULTY_LABEL[requirements.difficulty]}」难度布置了回声工坊：左侧房间和中部房间各有一面镜子，把光折向上方的接收器，对应闸门才会升起。`
  );
  if (validation.solution) {
    parts.push(`验证器实际搜索过镜面朝向与闸门状态，找到一条 ${validation.solution.pathLength} 步的通关路线。`);
  } else {
    parts.push("验证器没有找到通关路线，这一版不能交付给你试玩。");
  }
  if (requirements.hidden) parts.push("我在出口上方留了一个隐藏书架，里面有异常记录。");
  if (requirements.hints) parts.push("这一版给机关加了口令提示，靠近时能看到。");
  if (requirements.unsupported.length > 0) {
    parts.push(`你的描述里提到了${requirements.unsupported.join("、")}，当前工坊还没有这些能力，我先用已有的光路与平台机制实现最接近的版本。`);
  }
  parts.push(`草案编号 ${seed}。`);
  return parts.join("");
}

export function designWorkshopLevel(
  brief: string,
  options: {
    seed?: number;
    revisions?: number;
    feedbackApplied?: string[];
    requirements?: WorkshopRequirements;
  } = {}
): DesignOutcome {
  const requirements = options.requirements ?? interpretBrief(brief);
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1_000_000_000);
  let lastDraft: LevelDraft | null = null;
  let lastValidation: LevelValidation | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const seed = baseSeed + attempt * 7919;
    const draft = buildWorkshopDraft(requirements, seed);
    const validation = validateLevelDraft(draft);
    lastDraft = draft;
    lastValidation = validation;
    if (validation.ok) {
      return {
        draft,
        validation,
        requirements,
        explanation: describe(requirements, validation, seed),
        seed,
        attempts: attempt + 1,
        revisions: options.revisions ?? 1,
        feedbackApplied: options.feedbackApplied ?? []
      };
    }
  }

  const fallback = lastDraft ?? buildWorkshopDraft(requirements, baseSeed);
  const validation = lastValidation ?? validateLevelDraft(fallback);
  return {
    draft: fallback,
    validation,
    requirements,
    explanation:
      "验证器连续拒绝了六份草案，说明当前的房间组合还不足以支撑这个需求。我保留最后一份草案，等你调整描述后重新生成。",
    seed: baseSeed,
    attempts: 6,
    revisions: options.revisions ?? 1,
    feedbackApplied: options.feedbackApplied ?? []
  };
}

export function redesignWithFeedback(previous: DesignOutcome, feedback: string): DesignOutcome {
  const requirements: WorkshopRequirements = {
    ...previous.requirements,
    unsupported: [...previous.requirements.unsupported]
  };
  const applied: string[] = [];

  if (/跳不过|够不着|卡住|不可达|过不去/.test(feedback)) {
    requirements.difficulty = "easy";
    applied.push("把断口缩短、落脚点加宽");
  } else if (/难|挑战|烧脑/.test(feedback)) {
    requirements.difficulty = "hard";
    applied.push("提高难度：加宽断口并挖掉一格落脚平台");
  } else if (/简单|轻松|降低/.test(feedback)) {
    requirements.difficulty = "easy";
    applied.push("降低难度：缩短断口");
  }

  if (/不要隐藏|去掉隐藏|移除隐藏/.test(feedback)) {
    requirements.hidden = false;
    applied.push("移除隐藏区域");
  } else if (/隐藏|秘密/.test(feedback)) {
    requirements.hidden = true;
    applied.push("加入隐藏区域");
  }

  if (/提示|看不懂|不清楚/.test(feedback)) {
    requirements.hints = true;
    applied.push("为机关加上近距离提示");
  }

  const wantsReroll = /换一个|重来|重新设计|再来一版/.test(feedback);
  const seed = wantsReroll
    ? Math.floor(Math.random() * 1_000_000_000)
    : (previous.seed * 31 + 17) % 2_147_483_647;
  if (wantsReroll) applied.push("换了一份新的房间布局");

  if (applied.length === 0) applied.push("保留原有参数，只重新校验了一遍关卡");

  const outcome = designWorkshopLevel(requirements.summary, {
    seed,
    revisions: previous.revisions + 1,
    feedbackApplied: applied,
    requirements
  });
  return {
    ...outcome,
    explanation: `根据你的反馈，我${applied.join("、")}。${outcome.explanation}`
  };
}
