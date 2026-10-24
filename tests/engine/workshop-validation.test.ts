import { describe, expect, it } from "vitest";
import type { LevelDraft } from "@btr/contracts";
import { designWorkshopLevel } from "../../apps/web/src/integration/workshopDesigner";
import { validateLevelDraft } from "../../apps/web/src/game/workshop/validator";

function validDraft(): LevelDraft {
  return designWorkshopLevel("正常难度", { seed: 42 }).draft;
}

function clone(draft: LevelDraft): LevelDraft {
  return JSON.parse(JSON.stringify(draft)) as LevelDraft;
}

describe("workshop level validation", () => {
  it("accepts the designer's draft and proves the mechanism order", () => {
    const validation = validateLevelDraft(validDraft());
    expect(validation.ok).toBe(true);
    expect(validation.checks.map(check => check.id)).toContain("mechanism.required");
    expect(validation.checks.map(check => check.id)).toContain("mirrors.reachable");
    expect(validation.solution?.gatesOpened).toHaveLength(2);
  });

  it("rejects a draft whose exit is missing", () => {
    const draft = clone(validDraft());
    draft.objects = draft.objects.filter(object => object.kind !== "exit");
    const validation = validateLevelDraft(draft);
    expect(validation.ok).toBe(false);
    expect(validation.issues.map(issue => issue.code)).toContain("MISSING_EXIT");
  });

  it("rejects a draft where the gate is not necessary", () => {
    const draft = clone(validDraft());
    draft.objects = draft.objects.filter(object => object.kind !== "gate");
    const validation = validateLevelDraft(draft);
    expect(validation.ok).toBe(false);
    expect(validation.issues.map(issue => issue.code)).toContain("MECHANISM_OPTIONAL");
  });

  it("rejects a draft where a receiver is unreachable because the gate stays shut", () => {
    const draft = clone(validDraft());
    draft.objects = draft.objects.filter(object => object.id !== "receiver-2");
    const validation = validateLevelDraft(draft);
    expect(validation.ok).toBe(false);
    expect(validation.solvable).toBe(false);
  });

  it("rejects a draft whose mirrors are walled off", () => {
    const draft = clone(validDraft());
    draft.objects.push({
      id: "wall.block",
      kind: "wall",
      position: { x: 630, y: 540 },
      size: { width: 60, height: 120 },
      properties: {}
    });
    const validation = validateLevelDraft(draft);
    expect(validation.ok).toBe(false);
    expect(validation.issues.map(issue => issue.code)).toContain("MIRROR_UNREACHABLE");
  });
});
