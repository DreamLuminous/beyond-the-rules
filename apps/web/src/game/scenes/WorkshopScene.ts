import Phaser from "phaser";
import {
  LevelDraftSchema,
  type LevelDraft,
  type LevelObject,
  type MirrorOrientation
} from "@btr/contracts";
import { gameBridge } from "../../integration/gameBridge";
import { traceBeams } from "../workshop/beam";
import { buildGeometry, cellCenter, type DraftGeometry } from "../workshop/grid";

type MirrorView = {
  object: LevelObject;
  container: Phaser.GameObjects.Container;
  glyph: Phaser.GameObjects.Text;
  orientation: MirrorOrientation;
};

type GateView = {
  object: LevelObject;
  rect: Phaser.GameObjects.Rectangle;
  glyph: Phaser.GameObjects.Text;
  body: Phaser.Physics.Arcade.StaticBody;
  open: boolean;
};

const MOVE_SPEED = 250;
const JUMP_SPEED = 760;

export class WorkshopScene extends Phaser.Scene {
  private draft: LevelDraft | null = null;
  private geometry!: DraftGeometry;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "R", Phaser.Input.Keyboard.Key>;
  private mirrors: MirrorView[] = [];
  private gates = new Map<string, GateView>();
  private receivers = new Map<string, Phaser.GameObjects.Arc>();
  private beamGraphics!: Phaser.GameObjects.Graphics;
  private hintText!: Phaser.GameObjects.Text;
  private startedAt = 0;
  private rotations = 0;
  private hiddenFound = false;
  private finished = false;

  constructor() {
    super("workshop");
  }

  create() {
    this.mirrors = [];
    this.gates = new Map();
    this.receivers = new Map();
    this.rotations = 0;
    this.hiddenFound = false;
    this.finished = false;

    this.createTextures();
    this.drawBackdrop();

    const raw = this.registry.get("workshop.draft") as LevelDraft | undefined;
    const parsed = raw ? LevelDraftSchema.safeParse(raw) : null;
    if (!parsed || !parsed.success) {
      this.add.text(120, 300, "还没有可试玩的关卡草案。先在下方让墨点设计一关。", {
        color: "#9fd8e8",
        fontSize: "20px"
      });
      return;
    }
    this.draft = parsed.data;
    this.geometry = buildGeometry(this.draft, {});

    this.physics.world.setBounds(0, 0, this.draft.size.width, this.draft.size.height);
    this.cameras.main.setBounds(0, 0, this.draft.size.width, this.draft.size.height);

    const platforms = this.physics.add.staticGroup();
    for (const object of this.draft.objects) {
      if (object.kind !== "platform" && object.kind !== "wall") continue;
      const rect = this.add
        .rectangle(
          object.position.x,
          object.position.y,
          object.size?.width ?? 60,
          object.size?.height ?? 60,
          0x153b4f
        )
        .setStrokeStyle(2, 0x2d6071);
      this.physics.add.existing(rect, true);
      platforms.add(rect);
    }

    this.player = this.physics.add.sprite(this.draft.spawn.x, this.draft.spawn.y, "ws-player");
    this.player.setSize(38, 52).setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setGravityY(600);
    this.player.setDragX(900);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.physics.add.collider(this.player, platforms);
    this.createGates();
    this.createMechanisms();
    this.createExit();
    this.createHiddenLog();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,E,R") as Record<
      "W" | "A" | "S" | "D" | "E" | "R",
      Phaser.Input.Keyboard.Key
    >;

    this.add
      .text(20, 16, "WASD / ←→ 移动 · 空格跳跃 · E 转动镜子", {
        color: "#9fd8e8",
        fontSize: "14px",
        backgroundColor: "#061521",
        padding: { x: 10, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.hintText = this.add
      .text(20, 52, "目标是让两道光分别照亮上方的接收器。", {
        color: "#6f96aa",
        fontSize: "13px",
        backgroundColor: "#061521",
        padding: { x: 10, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.beamGraphics = this.add.graphics().setDepth(6);
    this.refreshBeam();
    this.startedAt = this.time.now;
  }

  update() {
    if (this.finished || !this.player?.body) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    if (left && !right) this.player.setVelocityX(-MOVE_SPEED);
    else if (right && !left) this.player.setVelocityX(MOVE_SPEED);
    else this.player.setVelocityX(0);

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space);
    if (jumpPressed && (body.blocked.down || body.touching.down)) {
      this.player.setVelocityY(-JUMP_SPEED);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.rotateNearbyMirror();
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.scene.restart();
      return;
    }

    if (this.draft && this.player.y > this.draft.size.height - 60) {
      this.player.setPosition(this.draft.spawn.x, this.draft.spawn.y).setVelocity(0, 0);
      this.hintText.setText("掉下去了，回到起点。按 R 可以重置整关。");
    }
  }

  private createGates() {
    if (!this.draft) return;
    for (const object of this.draft.objects) {
      if (object.kind !== "gate") continue;
      const rect = this.add
        .rectangle(
          object.position.x,
          object.position.y,
          object.size?.width ?? 60,
          object.size?.height ?? 120,
          0x2c6f86,
          0.92
        )
        .setStrokeStyle(3, 0x7cf2d6);
      this.physics.add.existing(rect, true);
      const glyph = this.add
        .text(object.position.x, object.position.y, "闸", { color: "#06232c", fontSize: "20px" })
        .setOrigin(0.5)
        .setDepth(7);
      this.gates.set(object.id, {
        object,
        rect,
        glyph,
        body: rect.body as Phaser.Physics.Arcade.StaticBody,
        open: false
      });
      this.physics.add.collider(this.player, rect);
    }
  }

  private createMechanisms() {
    if (!this.draft) return;

    for (const object of this.draft.objects) {
      if (object.kind === "emitter") {
        const marker = this.add.triangle(
          object.position.x,
          object.position.y,
          -14,
          -14,
          16,
          0,
          -14,
          14,
          0x54d9ec,
          0.9
        );
        marker.setStrokeStyle(2, 0xc8fbff);
        this.add.circle(object.position.x, object.position.y, 26, 0x54d9ec, 0.08);
      }

      if (object.kind === "receiver") {
        const ring = this.add.circle(object.position.x, object.position.y, 22, 0x1a4c5c, 0.9);
        ring.setStrokeStyle(3, 0x7b93a0);
        this.add.text(object.position.x - 20, object.position.y + 28, "接收器", {
          color: "#4f7786",
          fontSize: "11px"
        });
        this.receivers.set(object.id, ring);
      }

      if (object.kind === "mirror") {
        const orientation: MirrorOrientation = object.properties.orientation === "\\" ? "\\" : "/";
        const base = this.add.circle(0, 0, 24, 0x143a4a, 1).setStrokeStyle(3, 0x8ff0ff);
        const glyph = this.add
          .text(0, 0, orientation, { color: "#d9fdff", fontSize: "24px", fontStyle: "bold" })
          .setOrigin(0.5);
        const container = this.add.container(object.position.x, object.position.y, [base, glyph]);
        this.tweens.add({
          targets: base,
          alpha: 0.55,
          duration: 900,
          yoyo: true,
          repeat: -1
        });
        if (object.properties.hint === true) {
          this.add.text(object.position.x - 24, object.position.y - 58, "按 E 调整", {
            color: "#8ff0ff",
            fontSize: "12px"
          });
        }
        this.mirrors.push({ object, container, glyph, orientation });
      }
    }
  }

  private createExit() {
    if (!this.draft) return;
    const exit = this.draft.objects.find(object => object.kind === "exit");
    if (!exit) return;
    const zone = this.add.rectangle(
      exit.position.x,
      exit.position.y,
      exit.size?.width ?? 48,
      exit.size?.height ?? 84,
      0x64f4d2,
      0.28
    );
    zone.setStrokeStyle(3, 0x8effe6);
    this.physics.add.existing(zone, true);
    this.add.text(exit.position.x - 34, exit.position.y - 74, "出口", {
      color: "#9ffff0",
      fontSize: "14px"
    });
    this.physics.add.overlap(this.player, zone, () => this.finishLevel());
  }

  private createHiddenLog() {
    if (!this.draft) return;
    const log = this.draft.objects.find(object => object.kind === "log");
    if (!log) return;
    const orb = this.add.circle(log.position.x, log.position.y, 14, 0xffd27f, 0.95);
    orb.setStrokeStyle(2, 0xfff0c4);
    this.tweens.add({ targets: orb, y: log.position.y - 8, duration: 1200, yoyo: true, repeat: -1 });
    this.add.text(log.position.x - 30, log.position.y + 22, "异常记录", {
      color: "#b8935e",
      fontSize: "11px"
    });

    const zone = this.add.rectangle(log.position.x, log.position.y, 60, 60, 0x000000, 0);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (this.hiddenFound || !this.draft) return;
      this.hiddenFound = true;
      orb.setFillStyle(0x8effe6, 1);
      this.hintText.setText("你找到了一段异常记录：这里的设计者，曾经也是被设计出来的。");
      gameBridge.emit("workshopHidden", { levelId: this.draft.id, logId: log.id });
    });
  }

  private rotateNearbyMirror() {
    let nearest: MirrorView | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const mirror of this.mirrors) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        mirror.container.x,
        mirror.container.y
      );
      if (distance < 96 && distance < nearestDistance) {
        nearest = mirror;
        nearestDistance = distance;
      }
    }
    if (!nearest) {
      this.hintText.setText("靠近镜子后再按 E。");
      return;
    }

    nearest.orientation = nearest.orientation === "/" ? "\\" : "/";
    nearest.glyph.setText(nearest.orientation);
    nearest.container.setScale(0.88);
    this.tweens.add({ targets: nearest.container, scale: 1, duration: 180, ease: "Back.out" });
    this.rotations += 1;
    this.refreshBeam();
  }

  private refreshBeam() {
    if (!this.draft) return;
    const orientations = new Map<string, MirrorOrientation>();
    for (const mirror of this.mirrors) orientations.set(mirror.object.id, mirror.orientation);

    const result = traceBeams(this.draft, orientations, this.geometry);
    this.beamGraphics.clear();

    for (const beam of result.beams) {
      const lit = Boolean(beam.hitReceiverId);
      const color = lit ? 0x8effd8 : 0x54d9ec;
      this.beamGraphics.lineStyle(4, color, lit ? 0.95 : 0.7);
      const emitter = this.draft.objects.find(object => object.id === beam.emitterId);
      let previousPoint = emitter ? { x: emitter.position.x, y: emitter.position.y } : null;
      for (const cell of beam.cells) {
        const point = cellCenter(cell);
        if (previousPoint) this.beamGraphics.lineBetween(previousPoint.x, previousPoint.y, point.x, point.y);
        previousPoint = point;
      }
      this.beamGraphics.fillStyle(color, lit ? 0.9 : 0.5);
      for (const cell of beam.cells) {
        const point = cellCenter(cell);
        this.beamGraphics.fillCircle(point.x, point.y, 3);
      }
    }

    for (const [receiverId, ring] of this.receivers) {
      const lit = result.litReceiverIds.has(receiverId);
      ring.setFillStyle(lit ? 0x8effd8 : 0x1a4c5c, lit ? 0.95 : 0.9);
      ring.setStrokeStyle(3, lit ? 0xd6fff2 : 0x7b93a0);
    }

    for (const [gateId, gate] of this.gates) {
      const receiverId = gate.object.properties.receiverId;
      const open = typeof receiverId === "string" && result.litReceiverIds.has(receiverId);
      this.setGateOpen(gateId, open);
    }

    const allLit = this.receivers.size > 0 && this.receivers.size === result.litReceiverIds.size;
    this.hintText.setText(
      allLit ? "两个接收器都亮了，闸门已经打开。去出口。" : "目标是让两道光分别照亮上方的接收器。"
    );
  }

  private setGateOpen(gateId: string, open: boolean) {
    const gate = this.gates.get(gateId);
    if (!gate || gate.open === open) return;
    gate.open = open;
    gate.body.enable = !open;
    gate.glyph.setAlpha(open ? 0 : 1);
    this.tweens.killTweensOf(gate.rect);
    this.tweens.add({ targets: gate.rect, alpha: open ? 0.14 : 0.92, duration: 240 });
  }

  private finishLevel() {
    if (this.finished || !this.draft) return;
    this.finished = true;
    this.player.setVelocity(0, 0);
    this.player.setTint(0x8effd8);
    const banner = this.add
      .text(this.scale.width / 2, 120, "这一关，是它为你设计的", {
        color: "#d8fff3",
        fontSize: "30px",
        backgroundColor: "#0b2f37",
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2400, duration: 600 });
    this.time.delayedCall(400, () => {
      if (!this.draft) return;
      gameBridge.emit("workshopComplete", {
        levelId: this.draft.id,
        elapsedMs: Math.max(0, Math.round(this.time.now - this.startedAt)),
        mirrorRotations: this.rotations,
        hiddenFound: this.hiddenFound
      });
    });
  }

  private drawBackdrop() {
    const width = 1800;
    const height = 720;
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x102a3a, 0x102a3a, 0x071018, 0x071018, 1);
    graphics.fillRect(0, 0, width, height);
    for (let index = 0; index < 44; index += 1) {
      const x = (index * 157) % width;
      const y = (index * 83) % height;
      this.add.circle(x, y, 1 + (index % 3), 0x9ddfff, 0.12 + (index % 4) * 0.05);
    }
    graphics.fillStyle(0x55cdb6, 0.06);
    graphics.fillEllipse(width * 0.5, height * 0.78, width * 0.8, 190);
  }

  private createTextures() {
    if (!this.textures.exists("ws-player")) {
      const player = this.make.graphics({ x: 0, y: 0 });
      player.fillStyle(0xa8ffe5).fillRoundedRect(0, 0, 38, 52, 10);
      player.lineStyle(3, 0xffffff).strokeRoundedRect(1, 1, 36, 50, 10);
      player.generateTexture("ws-player", 38, 52);
      player.destroy();
    }
  }
}
