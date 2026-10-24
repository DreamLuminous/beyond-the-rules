export type Point = { x: number; y: number };

export type BridgeMechanismState = {
  pressurePlatePressed: boolean;
  auxiliaryPlatformActive: boolean;
};

export function isCratePressingPlate(crate: Point, plate: Point): boolean {
  const horizontallyAligned = Math.abs(crate.x - plate.x) <= 48;
  const restingOnPlate = crate.y <= plate.y && plate.y - crate.y <= 42;
  return horizontallyAligned && restingOnPlate;
}

export function deriveBridgeMechanismState(crate: Point, plate: Point): BridgeMechanismState {
  const pressurePlatePressed = isCratePressingPlate(crate, plate);
  return {
    pressurePlatePressed,
    auxiliaryPlatformActive: pressurePlatePressed
  };
}
