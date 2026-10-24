import type { ActionPlan, AgentPolicy, ExecutionResult, WorldSnapshot } from "@btr/contracts";

export interface GameRuntime {
  getSnapshot(): WorldSnapshot;
  execute(plan: ActionPlan): Promise<ExecutionResult>;
  executeAgentPolicy(policy: AgentPolicy): Promise<ExecutionResult>;
  setAgentPaused(paused: boolean): void;
  undo(): Promise<ExecutionResult | null>;
}

export type WorkshopResult = {
  levelId: string;
  elapsedMs: number;
  mirrorRotations: number;
  hiddenFound: boolean;
};

export type BridgeTaskEvent = {
  task: 1 | 2 | 3;
  title: string;
  objective: string;
  hint: string;
};

export type BridgeComplete = {
  elapsedMs: number;
  tasks: number;
  rulesApplied: number;
};

type Events = {
  snapshot: WorldSnapshot;
  workshopComplete: WorkshopResult;
  workshopHidden: { levelId: string; logId: string };
  bridgeTask: BridgeTaskEvent;
  bridgeComplete: BridgeComplete;
};

class GameBridge {
  private runtime: GameRuntime | null = null;
  private listeners: {
    [K in keyof Events]: Set<(value: Events[K]) => void>;
  } = {
    snapshot: new Set(),
    workshopComplete: new Set(),
    workshopHidden: new Set(),
    bridgeTask: new Set(),
    bridgeComplete: new Set()
  };

  attach(runtime: GameRuntime) {
    this.runtime = runtime;
  }

  getSnapshot() { return this.runtime?.getSnapshot() ?? null; }

  execute(plan: ActionPlan) {
    if (!this.runtime) throw new Error("Game runtime is not ready");
    return this.runtime.execute(plan);
  }

  executeAgentPolicy(policy: AgentPolicy) {
    if (!this.runtime) throw new Error("Game runtime is not ready");
    return this.runtime.executeAgentPolicy(policy);
  }

  setAgentPaused(paused: boolean) { this.runtime?.setAgentPaused(paused); }

  undo() { return this.runtime?.undo() ?? Promise.resolve(null); }

  emit<K extends keyof Events>(event: K, value: Events[K]) {
    for (const listener of this.listeners[event]) listener(value);
  }

  publishSnapshot(snapshot: WorldSnapshot) { this.emit("snapshot", snapshot); }

  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void) {
    this.listeners[event].add(listener as never);
    return () => {
      this.listeners[event].delete(listener as never);
    };
  }
}

export const gameBridge = new GameBridge();
