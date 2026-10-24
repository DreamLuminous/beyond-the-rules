import Phaser from "phaser";
import { FloatingBridgeScene } from "./scenes/FloatingBridgeScene";
import { WorkshopScene } from "./scenes/WorkshopScene";

export function createGame(parent: HTMLElement) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#081522",
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720
    },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 900 }, debug: false }
    },
    scene: [FloatingBridgeScene, WorkshopScene],
    render: { antialias: true, pixelArt: false }
  });
  // 调试与自动化冒烟测试入口；不参与游戏逻辑。
  (window as unknown as { __btrGame?: Phaser.Game }).__btrGame = game;
  return game;
}
