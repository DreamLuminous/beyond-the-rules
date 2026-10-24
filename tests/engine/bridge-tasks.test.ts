import { describe, expect, it } from "vitest";
import {
  hasReachedExit,
  hasReachedFarBank,
  isOnFirstStone,
  shouldRetractSlab
} from "../../apps/web/src/game/puzzles/bridgeTasks";

describe("first level task thresholds", () => {
  it("completes the first task only when standing on the first stone", () => {
    expect(isOnFirstStone(430, 544, true)).toBe(true);
    expect(isOnFirstStone(380, 544, true)).toBe(false);
    expect(isOnFirstStone(430, 544, false)).toBe(false);
    expect(isOnFirstStone(430, 600, true)).toBe(false);
  });

  it("moves to the far bank, the slab event and the exit at the designed moments", () => {
    expect(hasReachedFarBank(899, true)).toBe(false);
    expect(hasReachedFarBank(900, true)).toBe(true);
    expect(hasReachedFarBank(1200, false)).toBe(false);
    expect(shouldRetractSlab(1299)).toBe(false);
    expect(shouldRetractSlab(1300)).toBe(true);
    expect(hasReachedExit(1649)).toBe(false);
    expect(hasReachedExit(1650)).toBe(true);
  });
});
