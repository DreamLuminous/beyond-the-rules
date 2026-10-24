/**
 * M2：中文意图解析（规则式 NLU）。
 * 把玩家原话解析成结构化意图，供 planner 生成 ActionPlan。
 * 设计约束：
 *  - 只产生关卡已声明的动作（allowedCommands 由 planner 复核）；
 *  - 不解析出任何 JavaScript/未声明动作；
 *  - 支持同义表达（M0 回归输入覆盖）；
 *  - 越权意图（通关、改天气、增加水量等）标记为 forbidden。
 */
import { normalizeUtterance } from "./reference";

export type IntentAction =
  | { verb: "float"; slow: boolean }              // physics.setGravity 负值
  | { verb: "sink"; slow: boolean }               // physics.setGravity 恢复/加大
  | { verb: "move"; dx: number; dy: number }       // physics.move 相对位移
  | { verb: "push"; direction: "left" | "right" | "up" | "down" } // physics.applyForce
  | { verb: "rotate"; degrees: number }           // mechanism.rotate
  | { verb: "setState"; state: "on" | "off" | "open" | "closed" } // mechanism.setState
  | { verb: "forbidden"; reason: string };       // 越权意图

export interface ParsedIntent {
  /** 归一化后的原话（含语音错字修正）。 */
  text: string;
  /** 是否要求顺序执行（依次/分别/先…再…）。 */
  sequential: boolean;
  /** 是否要求同时执行（同时/一起/全都）。 */
  simultaneous: boolean;
  /** 解析出的动作；null 表示无法理解。 */
  action: IntentAction | null;
}

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/直接.{0,4}通关|让我通关|帮我通关|跳过关卡|直接赢|立刻胜利|过关真结局/, "通关判定由游戏世界决定"],
  [/传送我|把我传|带我到|瞬移/, "传送玩家不在允许的规则之内"],
  [/改天气|换天气|下雨也|天气改成/, "天气种子不可修改"],
  [/加水量|增加水|把水变多|多给点水/, "总水量不可凭空增加"],
  [/写.{0,6}代码|执行.{0,6}脚本|运行\s*js|javascript/i, "不允许生成或执行代码"],
];

export function parseIntent(raw: string): ParsedIntent {
  const text = normalizeUtterance(raw);
  const sequential = /依次|依次|分别|先后|先.{1,12}再|然后/.test(text);
  const simultaneous = /同时|一起|一齐|全都|全部一起/.test(text);

  for (const [re, reason] of FORBIDDEN_PATTERNS) {
    if (re.test(text)) return { text, sequential, simultaneous, action: { verb: "forbidden", reason } };
  }

  // 浮起 / 升起
  if (/浮起|浮起来|浮到空中|浮到半空|飘起|升起来|升到空中|升上去/.test(text)) {
    return { text, sequential, simultaneous, action: { verb: "float", slow: /慢慢|缓缓|逐渐|一点点/.test(text) } };
  }
  // 落下 / 恢复重力
  if (/落下|掉下去|放下来|降下来|恢复重力|变回正常/.test(text)) {
    return { text, sequential, simultaneous, action: { verb: "sink", slow: /慢慢|缓缓|逐渐/.test(text) } };
  }
  // 跳 / 弹起：把物体向上弹（允许“离谱”的操控）
  if (/跳起来|跳一下|往上跳|弹起|弹飞|蹦起来|跳/.test(text)) {
    return { text, sequential, simultaneous, action: { verb: "push", direction: "up" } };
  }
  // 扔 / 丢 / 移到最右、最左、天上：大位移
  if (/扔|丢|甩|抛|踢飞/.test(text) || /移到(最右|最左|天上|空中|最高|中间)/.test(text)) {
    const dx = /最右|右边|右侧/.test(text) ? 520 : /最左|左边|左侧/.test(text) ? -520 : 0;
    const dy = /天上|空中|上空|最高/.test(text) ? -420 : /地面|地上/.test(text) ? 300 : 0;
    return {
      text,
      sequential,
      simultaneous,
      action: { verb: "move", dx: dx === 0 && dy === 0 ? 300 : dx, dy }
    };
  }
  // 推
  {
    const m = text.match(/推|顶|撞/);
    if (m) {
      const direction = /向左|往左|左边推/.test(text) ? "left"
        : /向右|往右|右边推/.test(text) ? "right"
        : /向上|往上|上推|抬高/.test(text) ? "up"
        : "right";
      return { text, sequential, simultaneous, action: { verb: "push", direction } };
    }
  }
  // 旋转
  {
    const m = text.match(/(?:顺时针|逆时针|向左|向右|往左|往右)?\s*(?:旋转|转|拧)\s*(?:-?\d+(?:\.\d+)?)?\s*度?/);
    if (m && /旋转|转动|拧/.test(text)) {
      const degMatch = text.match(/(-?\d+(?:\.\d+)?)\s*度/);
      let degrees = degMatch ? Number(degMatch[1]) : 90;
      if (/逆时针|向左|往左/.test(text)) degrees = -Math.abs(degrees);
      return { text, sequential, simultaneous, action: { verb: "rotate", degrees } };
    }
  }
  // 开/关
  if (/打开|开启|启动|开开|通电|点亮/.test(text)) {
    return { text, sequential, simultaneous, action: { verb: "setState", state: /门|闸|盖/.test(text) ? "open" : "on" } };
  }
  if (/关上|关闭|停掉|断电|熄灭|合上/.test(text)) {
    return { text, sequential, simultaneous, action: { verb: "setState", state: /门|闸|盖/.test(text) ? "closed" : "off" } };
  }
  // 移动（带方向与距离的粗略量化）
  {
    const m = text.match(/(向|往|朝)\s*(左|右|上|下)\s*(?:移动|挪|移|推?)?\s*(\d+(?:\.\d+)?)?\s*(?:格|像素|米|步)?/);
    if (m && /移动|挪|移/.test(text)) {
      const unit = m[3] ? Number(m[3]) : 100;
      const magnitude = /一点|稍微|轻轻|一小段/.test(text) ? Math.min(unit, 60) : unit;
      const dir = m[2];
      const dx = dir === "左" ? -magnitude : dir === "右" ? magnitude : 0;
      const dy = dir === "上" ? -magnitude : dir === "下" ? magnitude : 0;
      return { text, sequential, simultaneous, action: { verb: "move", dx, dy } };
    }
  }

  return { text, sequential, simultaneous, action: null };
}
