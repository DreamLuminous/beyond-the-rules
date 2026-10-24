import {
  LevelDraftSchema,
  type LevelDraft,
  type LevelValidation,
  type MirrorOrientation,
  type ValidationCheck
} from "@btr/contracts";
import { traceBeams } from "./beam";
import {
  buildGeometry,
  cellKey,
  pointCell,
  type Cell,
  type DraftGeometry,
  type MirrorCell
} from "./grid";
import { adjacentStandingCells, computeReachability, isReachable } from "./reachability";

type Candidate = {
  orientations: Record<string, MirrorOrientation>;
  pathLength: number;
  gatesOpened: string[];
};

function mirrorCombinations(mirrors: MirrorCell[]): Map<string, MirrorOrientation>[] {
  const combinations: Map<string, MirrorOrientation>[] = [];
  const walk = (index: number, current: Map<string, MirrorOrientation>) => {
    if (index === mirrors.length) {
      combinations.push(new Map(current));
      return;
    }
    const mirror = mirrors[index];
    if (!mirror) return;
    for (const orientation of ["/", "\\"] as const) {
      current.set(mirror.id, orientation);
      walk(index + 1, current);
    }
    current.delete(mirror.id);
  };
  walk(0, new Map());
  return combinations;
}

function linkedGates(geometry: DraftGeometry, litReceiverIds: Set<string>): Set<string> {
  const open = new Set<string>();
  for (const gate of geometry.gates) {
    const receiverId = gate.properties.receiverId;
    if (typeof receiverId === "string" && litReceiverIds.has(receiverId)) open.add(gate.id);
  }
  return open;
}

function stagedReachability(draft: LevelDraft, closed: DraftGeometry) {
  const openGateIds = new Set<string>();
  const reachableMirrorIds = new Set<string>();
  let geometry = closed;
  let reachability = computeReachability(closed);

  for (let iteration = 0; iteration <= closed.gates.length + 1; iteration += 1) {
    geometry = buildGeometry(draft, { openGateIds });
    reachability = computeReachability(geometry);

    for (const mirror of geometry.mirrors) {
      const adjacent = adjacentStandingCells(geometry, mirror.cell);
      if (adjacent.some(cell => isReachable(reachability, cell))) reachableMirrorIds.add(mirror.id);
    }

    const reachableMirrors = geometry.mirrors.filter(mirror => reachableMirrorIds.has(mirror.id));
    let openedNew = false;
    for (const combo of mirrorCombinations(reachableMirrors)) {
      const beam = traceBeams(draft, combo, geometry);
      for (const gate of geometry.gates) {
        const receiverId = gate.properties.receiverId;
        if (
          typeof receiverId === "string" &&
          beam.litReceiverIds.has(receiverId) &&
          !openGateIds.has(gate.id)
        ) {
          openGateIds.add(gate.id);
          openedNew = true;
        }
      }
    }
    if (!openedNew) break;
  }

  return { openGateIds, reachability, reachableMirrorIds, geometry };
}

function invalid(reason: string): LevelValidation {
  return {
    version: 1,
    levelId: "invalid",
    ok: false,
    solvable: false,
    checks: [{ id: "contract", ok: false, detail: reason }],
    issues: [{ code: "INVALID_LEVEL_DRAFT", message: reason }],
    difficulty: { rating: "normal", pathLength: 0, mechanics: [] }
  };
}

export function validateLevelDraft(input: LevelDraft): LevelValidation {
  const parsed = LevelDraftSchema.safeParse(input);
  if (!parsed.success) return invalid("关卡草案不符合 LevelDraft 结构。");
  const draft = parsed.data;

  const checks: ValidationCheck[] = [{ id: "contract", ok: true, detail: "草案结构符合 LevelDraft。" }];
  const issues: LevelValidation["issues"] = [];
  const closed = buildGeometry(draft);
  const reachableClosed = computeReachability(closed);

  const spawnOk = reachableClosed.start !== null;
  checks.push({
    id: "spawn",
    ok: spawnOk,
    detail: spawnOk ? "出生点落在可站立平台上。" : "出生点悬空或位于实心物体内部。"
  });
  if (!spawnOk) issues.push({ code: "INVALID_SPAWN", message: "出生点不可站立。" });

  const exit = closed.exit;
  const exitCell: Cell | null = exit ? pointCell(exit.position) : null;
  checks.push({
    id: "exit",
    ok: Boolean(exitCell),
    detail: exitCell ? "存在可识别的出口。" : "关卡没有出口对象。"
  });
  if (!exitCell) issues.push({ code: "MISSING_EXIT", message: "关卡没有出口。" });

  const receiverIds = new Set(closed.receivers.map(receiver => receiver.id));
  const gatesLinked = closed.gates.filter(gate => {
    const receiverId = gate.properties.receiverId;
    return typeof receiverId === "string" && receiverIds.has(receiverId);
  });
  const wired =
    closed.emitters.length > 0 &&
    closed.receivers.length > 0 &&
    closed.mirrors.length > 0 &&
    closed.gates.length > 0 &&
    gatesLinked.length === closed.gates.length;

  checks.push({
    id: "mechanism",
    ok: wired,
    detail: wired
      ? `光路机关完整：${closed.emitters.length} 个发射器、${closed.receivers.length} 个接收器、${closed.mirrors.length} 面镜子、${closed.gates.length} 道闸门。`
      : "缺少发射器、接收器、镜子、闸门，或闸门没有绑定接收器。"
  });
  if (!wired) issues.push({ code: "INCOMPLETE_MECHANISM", message: "光路机关不完整。" });

  const staged = stagedReachability(draft, closed);
  const mirrorsReachable = closed.mirrors.every(mirror => staged.reachableMirrorIds.has(mirror.id));
  checks.push({
    id: "mirrors.reachable",
    ok: mirrorsReachable,
    detail: mirrorsReachable
      ? "每一面镜子都能在打开对应闸门之前走到，机关可以逐段启动。"
      : "有镜子被尚未打开的闸门挡在后面，机关无法启动。"
  });
  if (!mirrorsReachable) issues.push({ code: "MIRROR_UNREACHABLE", message: "部分镜子无法接近。" });

  const exitReachableWhileClosed = Boolean(exitCell && isReachable(reachableClosed, exitCell));
  const mechanismRequired = Boolean(exitCell) && !exitReachableWhileClosed;
  checks.push({
    id: "mechanism.required",
    ok: mechanismRequired,
    detail: mechanismRequired
      ? "不开闸门时走不到出口，必须启动光路。"
      : "不开闸门也能走到出口，谜题缺少必要性。"
  });
  if (!mechanismRequired && exitCell) {
    issues.push({ code: "MECHANISM_OPTIONAL", message: "不启动机关也能通关。" });
  }

  let best: Candidate | null = null;
  if (wired && exitCell) {
    for (const combo of mirrorCombinations(closed.mirrors)) {
      const beam = traceBeams(draft, combo, closed);
      const openGateIds = linkedGates(closed, beam.litReceiverIds);
      if (openGateIds.size === 0) continue;
      const opened = buildGeometry(draft, { openGateIds });
      const reachableOpen = computeReachability(opened);
      const pathLength = reachableOpen.distance.get(cellKey(exitCell));
      if (pathLength === undefined) continue;
      if (!best || pathLength < best.pathLength) {
        best = {
          pathLength,
          orientations: Object.fromEntries(combo) as Record<string, MirrorOrientation>,
          gatesOpened: [...openGateIds]
        };
      }
    }
  }

  const stagedExitReachable = Boolean(exitCell && isReachable(staged.reachability, exitCell));
  const solvable = best !== null && stagedExitReachable;
  checks.push({
    id: "solvable",
    ok: solvable,
    detail: best
      ? `验证器枚举镜面朝向与闸门状态后，找到一条 ${best.pathLength} 步的通关路径，并按玩家实际可达范围复核过闸门顺序。`
      : "枚举所有镜子朝向后，仍没有可达出口的路径。"
  });
  if (!best) issues.push({ code: "NOT_SOLVABLE", message: "找不到可行的通关路径。" });
  else if (!stagedExitReachable) {
    issues.push({ code: "STAGED_PATH_BLOCKED", message: "存在理论解，但玩家无法按顺序打开机关。" });
  }

  let hiddenOk = true;
  let hiddenDetail = "本关没有隐藏区域。";
  if (closed.log) {
    if (best && exitCell) {
      const beam = traceBeams(draft, new Map(Object.entries(best.orientations)), closed);
      const opened = buildGeometry(draft, { openGateIds: linkedGates(closed, beam.litReceiverIds) });
      const reachableOpen = computeReachability(opened);
      const logCell = pointCell(closed.log.position);
      hiddenOk =
        isReachable(reachableOpen, logCell) ||
        adjacentStandingCells(opened, logCell).some(cell => isReachable(reachableOpen, cell));
      hiddenDetail = hiddenOk ? "隐藏记录在通关路径上可以抵达。" : "隐藏记录被挡住了，玩家无法发现。";
    } else {
      hiddenOk = false;
      hiddenDetail = "关卡无解，隐藏区域无从验证。";
    }
    if (!hiddenOk) issues.push({ code: "HIDDEN_UNREACHABLE", message: "隐藏区域不可达。" });
  }
  checks.push({ id: "hidden", ok: hiddenOk, detail: hiddenDetail });

  const ok = checks.every(check => check.ok);
  const rating: LevelValidation["difficulty"]["rating"] = !best
    ? "normal"
    : best.pathLength <= 9
      ? "easy"
      : best.pathLength <= 11
        ? "normal"
        : "hard";

  return {
    version: 1,
    levelId: draft.id,
    ok,
    solvable,
    checks,
    issues,
    ...(best
      ? {
          solution: {
            mirrorOrientations: best.orientations,
            pathLength: best.pathLength,
            gatesOpened: best.gatesOpened
          }
        }
      : {}),
    difficulty: {
      rating,
      pathLength: best?.pathLength ?? 0,
      mechanics: ["mirror", "beam", "gate"].concat(closed.log ? ["hidden"] : [])
    }
  };
}
