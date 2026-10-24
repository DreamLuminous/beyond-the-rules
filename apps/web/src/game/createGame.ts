import Phaser from "phaser";
import { FloatingBridgeScene } from "./scenes/FloatingBridgeScene";

export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#081522",
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 900 }, debug: false }
    },
    scene: [FloatingBridgeScene],
    render: { antialias: true, pixelArt: false }
  });
}

