import { describe, expect, it } from "vitest";
import { designWorkshopLevel } from "../../apps/web/src/integration/workshopDesigner";
import { editWorkshopDraft } from "../../apps/web/src/integration/workshopEditor";
import { validateLevelDraft } from "../../apps/web/src/game/workshop/validator";

function design(hidden = false) {
  return designWorkshopLevel(hidden ? "要一点难的，最好有隐藏区域" : "正常难度", { seed: 42 });
}

describe("workshop direct edits", () => {
  it("moves the exit and stays solvable", () => {
    const draft = design().draft;
    const exitBefore = draft.objects.find(object => object.kind === "exit")!;
    const result = editWorkshopDraft(draft, "把出口往左移两格");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exitAfter = result.draft.objects.find(object => object.kind === "exit")!;
    expect(exitAfter.position.x).toBe(exitBefore.position.x - 120);
    expect(validateLevelDraft(result.draft).ok).toBe(true);
  });

  it("moves a mirror together with its receiver", () => {
    const draft = design().draft;
    const mirror = draft.objects.find(object => object.kind === "mirror")!;
    const receiver = draft.objects.find(object => object.kind === "receiver")!;
    const result = editWorkshopDraft(draft, "把第一面镜子往右移一格");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const movedMirror = result.draft.objects.find(object => object.id === mirror.id)!;
    const movedReceiver = result.draft.objects.find(object => object.id === receiver.id)!;
    expect(movedMirror.position.x).toBe(mirror.position.x + 60);
    expect(movedReceiver.position.x).toBe(receiver.position.x + 60);
    expect(validateLevelDraft(result.draft).ok).toBe(true);
  });

  it("adds and removes the hidden area", () => {
    const plain = design(false).draft;
    const added = editWorkshopDraft(plain, "加一个隐藏区域");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.draft.objects.some(object => object.kind === "log")).toBe(true);
    expect(validateLevelDraft(added.draft).ok).toBe(true);

    const hidden = design(true).draft;
    const removed = editWorkshopDraft(hidden, "去掉隐藏区域");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.draft.objects.some(object => object.kind === "log")).toBe(false);
    expect(validateLevelDraft(removed.draft).ok).toBe(true);
  });

  it("refuses moves that leave the grid", () => {
    const result = editWorkshopDraft(design().draft, "把出口往右移 30 格");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("边界");
  });
});
