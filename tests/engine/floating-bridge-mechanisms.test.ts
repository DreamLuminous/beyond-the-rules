import { describe, expect, it } from "vitest";
import {
  deriveBridgeMechanismState,
  isCratePressingPlate
} from "../../apps/web/src/game/puzzles/floatingBridgeMechanisms";

describe("floating bridge pressure mechanism", () => {
  const plate = { x: 700, y: 686 };

  it("activates the auxiliary platform when the crate rests on the pressure plate", () => {
    expect(deriveBridgeMechanismState({ x: 700, y: 666 }, plate)).toEqual({
      pressurePlatePressed: true,
      auxiliaryPlatformActive: true
    });
  });

  it("does not activate when the crate is beside or above the pressure plate", () => {
    expect(isCratePressingPlate({ x: 620, y: 666 }, plate)).toBe(false);
    expect(isCratePressingPlate({ x: 700, y: 610 }, plate)).toBe(false);
  });
});
