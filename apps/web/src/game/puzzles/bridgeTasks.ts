export type BridgeTaskId = 1 | 2 | 3;

export type BridgeTaskInfo = {
  id: BridgeTaskId;
  title: string;
  objective: string;
  hint: string;
  targetId: string;
};

export const BRIDGE_TASKS: Record<BridgeTaskId, BridgeTaskInfo> = {
  1: {
    id: 1,
    title: "第一次指导",
    objective: "让墨点走到第一块石板上",
    hint: "对墨点说：走到第一块石板上。它需要知道哪里允许落脚。",
    targetId: "stone.front"
  },
  2: {
    id: 2,
    title: "开放式过桥",
    objective: "让墨点把石板铺成通路，再走到对岸",
    hint: "你可以说：用石板搭一条路，然后过桥。",
    targetId: "waypoint.far"
  },
  3: {
    id: 3,
    title: "意外变化",
    objective: "继续走向装置；桥板缩回时用规则补上缺口",
    hint: "检修桥板缩回了。让墨点重新规划，或用规则把石板移到缺口。",
    targetId: "waypoint.exit"
  }
};

export const FIRST_STONE_TOP = 544;
export const FAR_BANK_X = 900;
export const SLAB_RETRACT_X = 1300;
export const EXIT_X = 1650;

export function isOnFirstStone(x: number, feetY: number, grounded: boolean): boolean {
  return grounded && x >= 400 && x <= 515 && Math.abs(feetY - FIRST_STONE_TOP) <= 6;
}

export function hasReachedFarBank(x: number, grounded: boolean): boolean {
  return grounded && x >= FAR_BANK_X;
}

export function shouldRetractSlab(x: number): boolean {
  return x >= SLAB_RETRACT_X;
}

export function hasReachedExit(x: number): boolean {
  return x >= EXIT_X;
}
