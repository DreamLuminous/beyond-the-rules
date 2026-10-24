import Phaser from "phaser";
import type { ActionPlan, ExecutionResult, WorldSnapshot } from "@btr/contracts";
import { preflight } from "@btr/rule-engine";
import { gameBridge, type GameRuntime } from "../../integration/gameBridge";

type MutableBody = Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image;
type ObjectState = { x: number; y: number; velocityX: number; velocityY: number; gravityY: number };
type UndoFrame = { revision: number; budget: number; states: Map<string, ObjectState> };

export class FloatingBridgeScene extends Phaser.Scene implements GameRuntime {
  private player!: Phaser.Physics.Arcade.Sprite;
  private objects = new Map<string, MutableBody>();
  private labels = new Map<string, string>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private aKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private revision = 0;
  private budget = 100;
  private undoStack: UndoFrame[] = [];
  private reachedExit = false;

  constructor() { super("floating-bridge"); }

  create() {
    this.createTextures();
    this.drawBackdrop();
    const platforms = this.physics.add.staticGroup();
    this.addPlatform(platforms, 170, 580, 340, 72, 0x153b4f);
    this.addPlatform(platforms, 1110, 560, 420, 92, 0x173e50);
    this.addPlatform(platforms, 650, 705, 230, 26, 0x102b3d);

    this.player = this.physics.add.sprite(120, 490, "player").setDisplaySize(30, 48);
    this.player.setTint(0xa8ffe5).setCollideWorldBounds(true).setBounce(0.05);
    this.player.body!.setSize(30, 48);

    const stone1 = this.createStone("stone.front", "前方石板", 410, 520);
    const stone2 = this.createStone("stone.middle", "中央石板", 610, 610);
    const stone3 = this.createStone("stone.far", "远处石板", 830, 500);
    const crate = this.createBody("crate.wind", "风场木箱", 270, 510, 44, 44, 0xc7935b);

    this.physics.add.collider(this.player, platforms);
    this.physics.add.collider(this.player, [stone1, stone2, stone3, crate]);
    this.physics.add.collider([stone1, stone2, stone3, crate], platforms);
    this.physics.add.collider([stone1, stone2, stone3, crate], [stone1, stone2, stone3, crate]);

    const exit = this.add.rectangle(1190, 460, 54, 110, 0x64f4d2, .25).setStrokeStyle(3, 0x8effe6);
    this.physics.add.existing(exit, true);
    this.add.text(1140, 382, "出口", { color: "#9ffff0", fontSize: "15px" });
    this.physics.add.overlap(this.player, exit, () => this.onReachExit());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.add.text(55, 400, "起点", { color: "#7ba7ba", fontSize: "14px" });
    this.add.text(535, 656, "隐藏的谷底平台", { color: "#426e80", fontSize: "12px" });
    gameBridge.attach(this);
    this.emitSnapshot();
  }

  update() {
    const left = this.cursors.left.isDown || this.aKey.isDown;
    const right = this.cursors.right.isDown || this.dKey.isDown;
    this.player.setVelocityX(left ? -230 : right ? 230 : 0);
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.space);
    const grounded = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (jump && grounded) this.player.setVelocityY(-470);
  }

  getSnapshot(): WorldSnapshot {
    const objects: WorldSnapshot["objects"] = [...this.objects.entries()].map(([id, object]) => ({
      id,
      kind: id.startsWith("stone") ? "stone" : "crate",
      label: this.labels.get(id) ?? id,
      position: { x: object.x, y: object.y },
      state: { gravityY: object.body?.gravity.y ?? 0, active: object.active },
      capabilities: id.startsWith("stone") ? ["move", "setGravity", "applyForce"] : ["move", "applyForce"],
      immutable: false
    }));
    objects.push({
      id: "exit.portal", kind: "portal", label: "出口传送门",
      position: { x: 1190, y: 460 }, state: { active: true }, capabilities: [], immutable: true
    });
    return {
      version: 1,
      levelId: "floating-bridge",
      worldRevision: this.revision,
      selectedObjectIds: [],
      objective: "跨过断裂山谷并抵达传送门",
      budgetRemaining: this.budget,
      allowedCommands: ["physics.move", "physics.setGravity", "physics.applyForce", "mechanism.setState"],
      objects
    };
  }

  async execute(plan: ActionPlan): Promise<ExecutionResult> {
    const before = this.getSnapshot();
    const validation = preflight(plan, before);
    if (!validation.ok) return this.result(plan, "rejected", before.worldRevision, validation.message, []);

    const frame: UndoFrame = { revision: this.revision, budget: this.budget, states: new Map() };
    for (const step of plan.steps) {
      const targetId = "targetId" in step.command ? step.command.targetId : undefined;
      if (targetId) this.capture(frame, targetId);
    }
    this.undoStack.push(frame);

    const stepResults: ExecutionResult["stepResults"] = [];
    for (const step of plan.steps) {
      const command = step.command;
      if (command.type === "physics.setGravity") {
        const target = this.objects.get(command.targetId)!;
        target.setGravityY(900 * command.gravityScale - 900);
        target.setVelocityY(command.gravityScale < 0 ? -75 : 0);
        this.flashRule(target, "重力改写");
      } else if (command.type === "physics.move") {
        const target = this.objects.get(command.targetId)!;
        await this.tweenTo(target, command.destination.x, command.destination.y, command.durationMs);
      } else if (command.type === "physics.applyForce") {
        const target = this.objects.get(command.targetId)!;
        target.setVelocity(command.force.x, command.force.y);
        this.flashRule(target, "施加推力");
      }
      stepResults.push({ stepId: step.id, status: "completed", message: "步骤已完成", changes: [command.type] });
    }
    this.budget = Math.max(0, this.budget - plan.estimatedCost);
    this.revision += 1;
    this.emitSnapshot();
    return this.result(plan, "completed", before.worldRevision, `规则已生效：${plan.summary}`, stepResults);
  }

  async undo(): Promise<ExecutionResult | null> {
    const frame = this.undoStack.pop();
    if (!frame) return null;
    const before = this.revision;
    for (const [id, state] of frame.states) {
      const object = this.objects.get(id);
      if (!object) continue;
      object.setPosition(state.x, state.y).setVelocity(state.velocityX, state.velocityY).setGravityY(state.gravityY);
    }
    this.budget = frame.budget;
    this.revision += 1;
    this.emitSnapshot();
    return {
      version: 1, requestId: `undo-${this.revision}`, status: "completed",
      worldRevisionBefore: before, worldRevisionAfter: this.revision,
      stepResults: [], userMessage: "上一条规则已撤销，世界状态已恢复。"
    };
  }

  private createStone(id: string, label: string, x: number, y: number) {
    return this.createBody(id, label, x, y, 116, 24, 0x4b8292);
  }

  private createBody(id: string, label: string, x: number, y: number, width: number, height: number, color: number) {
    const object = this.physics.add.image(x, y, "block").setDisplaySize(width, height).setTint(color);
    object.body!.setSize(width, height);
    object.setCollideWorldBounds(true).setBounce(.08).setDragX(80);
    this.objects.set(id, object);
    this.labels.set(id, label);
    return object;
  }

  private addPlatform(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, width: number, height: number, color: number) {
    const platform = this.add.rectangle(x, y, width, height, color).setStrokeStyle(2, 0x2d6071);
    this.physics.add.existing(platform, true);
    group.add(platform);
  }

  private capture(frame: UndoFrame, id: string) {
    if (frame.states.has(id)) return;
    const object = this.objects.get(id);
    const body = object?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!object || !body) return;
    frame.states.set(id, { x: object.x, y: object.y, velocityX: body.velocity.x, velocityY: body.velocity.y, gravityY: body.gravity.y });
  }

  private tweenTo(target: MutableBody, x: number, y: number, duration: number) {
    target.body!.enable = false;
    return new Promise<void>(resolve => {
      this.tweens.add({ targets: target, x, y, duration, ease: "Sine.inOut", onComplete: () => {
        target.body!.enable = true;
        (target.body as Phaser.Physics.Arcade.Body).reset(x, y);
        this.flashRule(target, "位置重构");
        resolve();
      }});
    });
  }

  private flashRule(target: MutableBody, label: string) {
    const ring = this.add.circle(target.x, target.y, 22).setStrokeStyle(3, 0x72f7d4).setAlpha(.9);
    const text = this.add.text(target.x, target.y - 46, label, { color: "#8effdf", fontSize: "12px" }).setOrigin(.5);
    this.tweens.add({ targets: ring, radius: 70, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: text, y: text.y - 18, alpha: 0, duration: 900, onComplete: () => text.destroy() });
  }

  private result(plan: ActionPlan, status: ExecutionResult["status"], before: number, message: string, stepResults: ExecutionResult["stepResults"]): ExecutionResult {
    return { version: 1, requestId: plan.requestId, status, worldRevisionBefore: before,
      worldRevisionAfter: this.revision, stepResults, userMessage: message,
      ...(status === "completed" ? { undoToken: `undo-${this.revision}` } : {}) };
  }

  private emitSnapshot() { gameBridge.publishSnapshot(this.getSnapshot()); }

  private onReachExit() {
    if (this.reachedExit) return;
    this.reachedExit = true;
    const banner = this.add.text(this.scale.width / 2, 120, "规则成立 · 已抵达彼岸", {
      color: "#d8fff3", fontSize: "28px", backgroundColor: "#0b2f37", padding: { x: 22, y: 12 }
    }).setOrigin(.5).setScrollFactor(0).setDepth(10);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2200, duration: 600 });
  }

  private drawBackdrop() {
    const width = Math.max(this.scale.width, 1280);
    const height = Math.max(this.scale.height, 720);
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x0c2336, 0x0c2336, 0x06101b, 0x06101b, 1);
    graphics.fillRect(0, 0, width, height);
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 173) % width;
      const y = (i * 97) % Math.max(200, height - 180);
      this.add.circle(x, y, 1 + (i % 3), 0x9ddfff, .18 + (i % 4) * .07);
    }
    graphics.fillStyle(0x0a1a27, .95);
    graphics.fillTriangle(0, height, 420, 300, 720, height);
    graphics.fillTriangle(500, height, 920, 260, width, height);
    graphics.fillStyle(0x55cdb6, .08);
    graphics.fillEllipse(width * .5, height * .76, width * .75, 180);
  }

  private createTextures() {
    if (!this.textures.exists("block")) {
      const block = this.make.graphics({ x: 0, y: 0 });
      block.fillStyle(0xffffff).fillRoundedRect(0, 0, 128, 48, 7);
      block.lineStyle(3, 0xb9ffff).strokeRoundedRect(1, 1, 126, 46, 7);
      block.generateTexture("block", 128, 48);
      block.destroy();
    }
    if (!this.textures.exists("player")) {
      const player = this.make.graphics({ x: 0, y: 0 });
      player.fillStyle(0xffffff).fillRoundedRect(0, 0, 30, 48, 9);
      player.generateTexture("player", 30, 48);
      player.destroy();
    }
  }
}

