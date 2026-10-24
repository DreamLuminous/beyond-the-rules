import { useEffect, useRef, useState } from "react";
import type { ActionPlan, ExecutionResult, WorldSnapshot } from "@btr/contracts";
import { createGame } from "./game/createGame";
import { gameBridge } from "./integration/gameBridge";
import { createLocalDemoPlan, createLocalDemoPolicy } from "./integration/mockPlanner";

type HistoryItem = { input: string; result: ExecutionResult };

export function App() {
  const gameHost = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("墨点，先走到箱子旁边，观察周围的机关");
  const [status, setStatus] = useState("等待你的任务");
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [agentPaused, setAgentPaused] = useState(false);

  useEffect(() => {
    if (!gameHost.current) return;
    const game = createGame(gameHost.current);
    const offSnapshot = gameBridge.on("snapshot", setSnapshot);
    return () => {
      offSnapshot();
      game.destroy(true);
    };
  }, []);

  async function submitRule() {
    const phrase = input.trim();
    if (!phrase) return;
    const world = gameBridge.getSnapshot();
    if (!world) {
      setStatus("场景尚未准备完成");
      return;
    }

    const policy = createLocalDemoPolicy(phrase, world);
    if (policy) {
      setStatus("墨点正在观察世界并执行计划…");
      const result = await gameBridge.executeAgentPolicy(policy);
      setHistory(items => [{ input: phrase, result }, ...items].slice(0, 6));
      setStatus(result.userMessage);
      return;
    }

    setStatus("正在理解并预检环境规则…");
    const plan: ActionPlan | null = createLocalDemoPlan(phrase, world);
    if (!plan) {
      setStatus("当前演示支持指挥墨点接近箱子，或用规则改变石头、木箱与风场");
      return;
    }

    const result = await gameBridge.execute(plan);
    setHistory(items => [{ input: phrase, result }, ...items].slice(0, 6));
    setStatus(result.userMessage);
  }

  async function undo() {
    const result = await gameBridge.undo();
    setStatus(result?.userMessage ?? "当前没有可以撤销的规则");
  }

  function toggleAgent() {
    const nextPaused = !agentPaused;
    gameBridge.setAgentPaused(nextPaused);
    setAgentPaused(nextPaused);
    setStatus(nextPaused ? "墨点已暂停，等待新的判断" : "墨点已继续行动");
  }

  return (
    <main className="app-shell">
      <header className="hud">
        <div>
          <span className="eyebrow">第一章 · 人制定任务，AI 自主行动</span>
          <h1>悬空之桥</h1>
        </div>
        <div className="objective">
          <span>目标</span>
          <strong>指导墨点安全跨越断谷并启动对岸装置</strong>
        </div>
        <div className="resource">
          <span>规则能量</span>
          <strong>{Math.round(snapshot?.budgetRemaining ?? 100)}</strong>
        </div>
      </header>

      <section className="game-stage" aria-label="游戏画面">
        <div ref={gameHost} className="game-canvas" />
        <div className="controls-hint">你负责目标与约束 · 墨点负责观察、移动和行动</div>
      </section>

      <section className="rule-console">
        <div className="rule-input-wrap">
          <button className="mic" type="button" disabled title="语音将在 B 线接入">●</button>
          <input
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => event.key === "Enter" && void submitRule()}
            aria-label="给墨点下达任务"
            placeholder="告诉墨点目标，或输入一条改变世界的规则…"
          />
          <button className="primary" type="button" onClick={() => void submitRule()}>交给墨点</button>
          <button className="secondary" type="button" onClick={toggleAgent}>{agentPaused ? "继续" : "暂停"}</button>
          <button className="secondary" type="button" onClick={() => void undo()}>撤销</button>
        </div>
        <div className="status-line"><i />{status}</div>
        {history.length > 0 && (
          <details>
            <summary>共创记录（{history.length}）</summary>
            <ul>
              {history.map((item, index) => (
                <li key={`${item.result.requestId}-${index}`}>
                  <span>“{item.input}”</span>
                  <b data-status={item.result.status}>{item.result.status === "completed" ? "已完成" : "未执行"}</b>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

