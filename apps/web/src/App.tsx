import { useEffect, useRef, useState } from "react";
import type { ActionPlan, ExecutionResult, WorldSnapshot } from "@btr/contracts";
import { createGame } from "./game/createGame";
import { gameBridge } from "./integration/gameBridge";
import { createLocalDemoPlan } from "./integration/mockPlanner";

type HistoryItem = { input: string; result: ExecutionResult };

export function App() {
  const gameHost = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("让前面的石头慢慢浮起来");
  const [status, setStatus] = useState("等待规则");
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

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

    setStatus("正在理解并预检规则…");
    const plan: ActionPlan | null = createLocalDemoPlan(phrase, world);
    if (!plan) {
      setStatus("当前离线演示只识别“浮起、移动、推开、撤销”类规则");
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

  return (
    <main className="app-shell">
      <header className="hud">
        <div>
          <span className="eyebrow">第一章 · 基础能力</span>
          <h1>悬空之桥</h1>
        </div>
        <div className="objective">
          <span>目标</span>
          <strong>利用规则跨越断谷，到达右侧传送门</strong>
        </div>
        <div className="resource">
          <span>规则能量</span>
          <strong>{Math.round(snapshot?.budgetRemaining ?? 100)}</strong>
        </div>
      </header>

      <section className="game-stage" aria-label="游戏画面">
        <div ref={gameHost} className="game-canvas" />
        <div className="controls-hint">A/D 移动 · Space 跳跃 · 输入规则改变世界</div>
      </section>

      <section className="rule-console">
        <div className="rule-input-wrap">
          <button className="mic" type="button" disabled title="语音将在 B 线接入">●</button>
          <input
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => event.key === "Enter" && void submitRule()}
            aria-label="输入你的规则"
            placeholder="说出或输入你的规则…"
          />
          <button className="primary" type="button" onClick={() => void submitRule()}>执行规则</button>
          <button className="secondary" type="button" onClick={() => void undo()}>撤销</button>
        </div>
        <div className="status-line"><i />{status}</div>
        {history.length > 0 && (
          <details>
            <summary>规则历史（{history.length}）</summary>
            <ul>
              {history.map((item, index) => (
                <li key={`${item.result.requestId}-${index}`}>
                  <span>“{item.input}”</span>
                  <b data-status={item.result.status}>{item.result.status === "completed" ? "已生效" : "未执行"}</b>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

