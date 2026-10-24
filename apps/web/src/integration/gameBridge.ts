import type { ActionPlan, AgentPolicy, ExecutionResult, WorldSnapshot } from "@btr/contracts";

export interface GameRuntime {
  getSnapshot(): WorldSnapshot;
  execute(plan: ActionPlan): Promise<ExecutionResult>;
  executeAgentPolicy(policy: AgentPolicy): Promise<ExecutionResult>;
  setAgentPaused(paused: boolean): void;
  undo(): Promise<ExecutionResult | null>;
}

type Events = { snapshot: WorldSnapshot };

class GameBridge {
  private runtime: GameRuntime | null = null;
  private listeners = new Set<(snapshot: WorldSnapshot) => void>();

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

  publishSnapshot(snapshot: WorldSnapshot) {
    for (const listener of this.listeners) listener(snapshot);
  }

  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void) {
    if (event === "snapshot") this.listeners.add(listener as (snapshot: WorldSnapshot) => void);
    return () => this.listeners.delete(listener as (snapshot: WorldSnapshot) => void);
  }
}

export const gameBridge = new GameBridge();

