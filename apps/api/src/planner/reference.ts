/**
 * M2：物体指代消解。
 * 优先级（docs/PLAN-B-AI-INTERACTION.md）：
 *  1. 当前选中的对象（selectedObjectIds 唯一时直接命中）；
 *  2. 原话里的空间关系（「前面/左边/最近」等）在同类物体中筛选；
 *  3. 原话或标签的精确/唯一匹配；
 *  4. 仍模糊时返回候选列表，由上层转成 TARGET_AMBIGUOUS 追问。
 */
import type { WorldSnapshot } from "@btr/contracts";
import type { CompactObject } from "./snapshot";

export type Resolution =
  | { kind: "resolved"; objects: CompactObject[] }
  | { kind: "ambiguous"; label: string; candidates: CompactObject[] }
  | { kind: "notFound"; label: string };

/** 同音/口语错字归一化：语音识别常见的错误映射。 */
const SPEECH_FIXES: Array<[RegExp, string]> = [
  [/升起|生起|升起来|生起来/g, "浮起"],
  [/实块|十块|石快/g, "石块"],
  [/石板/g, "石板"],
  [/浮桥|浮起来了/g, "浮起"],
];

export function normalizeUtterance(raw: string): string {
  let s = raw.trim();
  for (const [re, to] of SPEECH_FIXES) s = s.replace(re, to);
  return s;
}

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/蓝/, "蓝"],
  [/青/, "青"],
  [/绿/, "绿"],
  [/紫/, "紫"],
  [/橙|橘/, "橙"],
  [/黄/, "黄"],
  [/白/, "白"],
  [/红/, "红"]
];

/** 提取颜色词：场景里的可操控物体会用颜色命名，方便玩家自由指代。 */
export function extractColorWord(utterance: string): string | null {
  for (const [pattern, name] of COLOR_WORDS) {
    if (pattern.test(utterance)) return name;
  }
  return null;
}

/** 从原话中提取被谈论的物体类别词。 */
export function extractKindWords(utterance: string): string[] {
  const words: string[] = [];
  if (/石块|石头|石板/.test(utterance)) words.push("stone");
  if (/传送门|门/.test(utterance)) words.push("portal");
  if (/平台/.test(utterance)) words.push("platform");
  if (/机关|开关|闸门/.test(utterance)) words.push("mechanism");
  if (/水车|风车/.test(utterance)) words.push("mill");
  if (/箱子|木箱/.test(utterance)) words.push("crate");
  return words;
}

/** 空间关系筛选：返回按关系词排序后的同类物体。 */
function spatialFilter(
  objects: CompactObject[],
  utterance: string
): { objects: CompactObject[]; spatial: boolean } {
  const withPos = objects.filter((o) => o.position);
  if (withPos.length === 0) return { objects, spatial: false };
  let sorted = withPos;
  if (/前面|前方|前方|前面的/.test(utterance)) {
    sorted = [...withPos].sort((a, b) => (b.position!.x - a.position!.x));
  } else if (/后面|后方|后面的/.test(utterance)) {
    sorted = [...withPos].sort((a, b) => (a.position!.x - b.position!.x));
  } else if (/左边|左侧/.test(utterance)) {
    sorted = [...withPos].sort((a, b) => (a.position!.x - b.position!.x));
  } else if (/右边|右侧/.test(utterance)) {
    sorted = [...withPos].sort((a, b) => (b.position!.x - a.position!.x));
  } else {
    return { objects, spatial: false };
  }
  return { objects: sorted, spatial: true };
}

/**
 * 解析「第几个 + 类别」的序数表达，如「三块石板」「第二块石头」「前两块」。
 * 返回 null 表示原话中没有数量/序数表达。
 */
export function extractCount(utterance: string): number | null {
  const cnNums: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const cnMatch = utterance.match(/([一二两三四五六七八九])\s*(块|个|张|条|只)/);
  if (cnMatch) return cnMatch[1] ? cnNums[cnMatch[1]] ?? null : null;
  const arMatch = utterance.match(/(\d+)\s*(块|个|张|条|只)/);
  if (arMatch) return Number(arMatch[1]);
  const ordMatch = utterance.match(/第\s*([一二两三四五六七八九]|\d+)\s*(块|个|张|条|只)/);
  if (ordMatch) {
    const v = ordMatch[1] ?? "1";
    return /\d/.test(v) ? Number(v) : (cnNums[v] ?? null);
  }
  return null;
}

export function resolveTargets(utterance: string, world: WorldSnapshot): Resolution {
  const objects = world.objects.map((o) => ({
    id: o.id, label: o.label, kind: o.kind, immutable: o.immutable,
    capabilities: o.capabilities,
    ...(o.position ? { position: { x: o.position.x, y: o.position.y } } : {}),
    state: o.state,
  }));

  // 1) 选中对象优先（唯一选中才算命中）
  if (world.selectedObjectIds.length === 1) {
    const hit = objects.find((o) => o.id === world.selectedObjectIds[0]);
    if (hit) return { kind: "resolved", objects: [hit] };
  }

  // 2) 标签精确包含（原话里出现了完整标签）
  const labelHits = objects.filter((o) => utterance.includes(o.label));
  if (labelHits.length === 1) return { kind: "resolved", objects: labelHits };

  // 2.5) 颜色词：场景物体用颜色命名，颜色唯一时直接命中
  const color = extractColorWord(utterance);
  if (color) {
    const colorHits = objects.filter((o) => o.label.includes(color));
    if (colorHits.length === 1) return { kind: "resolved", objects: colorHits };
  }

  // 3) 类别词 + 空间关系/数量
  const kindWords = extractKindWords(utterance);
  const count = extractCount(utterance);
  for (const kw of kindWords) {
    let sameKind = objects.filter((o) => o.kind === kw || o.label.includes(kw));
    if (color) sameKind = sameKind.filter((o) => o.label.includes(color));
    if (sameKind.length === 0) continue;

    if (/全部|所有|每个|每一块/.test(utterance)) {
      return { kind: "resolved", objects: sameKind };
    }
    const { objects: spatialSorted, spatial } = spatialFilter(sameKind, utterance);
    if (count && count > 1) {
      const pool = spatial ? spatialSorted.slice(0, count) : sameKind.slice(0, count);
      if (pool.length >= count) return { kind: "resolved", objects: pool };
      return { kind: "resolved", objects: pool };
    }
    if (spatial && spatialSorted.length > 0) return { kind: "resolved", objects: [spatialSorted[0]!] };
    if (sameKind.length === 1) return { kind: "resolved", objects: sameKind };
    if (sameKind.length > 1) {
      return { kind: "ambiguous", label: kw, candidates: sameKind };
    }
  }

  // 4) 只有选中对象但没有类别词
  if (world.selectedObjectIds.length > 0) {
    const hits = objects.filter((o) => world.selectedObjectIds.includes(o.id));
    if (hits.length > 1) return { kind: "ambiguous", label: "选中的物体", candidates: hits };
    if (hits.length === 1) return { kind: "resolved", objects: hits };
  }

  // 5) 完全没有类别词且提到了「它/这个/那个」等指代
  if (/它|这个|那个|这东西|它们/.test(utterance) && objects.length > 0) {
    return { kind: "ambiguous", label: "它", candidates: objects.filter((o) => !o.immutable) };
  }

  return { kind: "notFound", label: "目标" };
}
