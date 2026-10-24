import { useEffect, useRef, useState } from "react";
import type { ActionPlan, ExecutionResult, WorldSnapshot } from "@btr/contracts";
import { CityChapter } from "./ai-ui/CityChapter";
import { VoiceConsole } from "./components/voice/VoiceConsole";
import { createGame } from "./game/createGame";
import { requestServerPlan } from "./integration/plannerClient";
import { BRIDGE_TASKS } from "./game/puzzles/bridgeTasks";
import {
  gameBridge,
  type BridgeComplete,
  type BridgeTaskEvent,
  type WorkshopResult
} from "./integration/gameBridge";
import { createBridgeDirection } from "./integration/bridgeDirector";
import { createLocalDemoPlan, createLocalDemoPolicy } from "./integration/mockPlanner";
import { editWorkshopDraft } from "./integration/workshopEditor";
import { validateLevelDraft } from "./game/workshop/validator";
import {
  designWorkshopLevel,
  redesignWithFeedback,
  type DesignOutcome
} from "./integration/workshopDesigner";

type HistoryItem = { input: string; result: ExecutionResult };
type Mode = "bridge" | "workshop" | "city";

const DIFFICULTY_LABEL = { easy: "轻松", normal: "标准", hard: "困难" } as const;
const DEFAULT_BRIEF = "我想玩一关需要反射光线的挑战，有点难，最好有隐藏区域";

function DesignReport({ design }: { design: DesignOutcome }) {
  const { validation } = design;
  return (
    <div className="design-report">
      <div className="design-title">
        <div>
          <span className="design-kicker">墨点的草案 · 第 {design.revisions} 版</span>
          <strong>{design.draft.name}</strong>
        </div>
        <span className={validation.ok ? "verdict ok" : "verdict bad"}>
          {validation.ok ? "验证通过" : "验证拒绝"}
        </span>
      </div>
      <ul className="checks">
        {validation.checks.map(check => (
          <li key={check.id} data-ok={check.ok}>
            <b>{check.ok ? "✓" : "✕"}</b>
            <span>{check.detail}</span>
          </li>
        ))}
      </ul>
      <p className="design-meta">
        难度 {DIFFICULTY_LABEL[design.requirements.difficulty]} · 通关路径{" "}
        {validation.solution ? `${validation.solution.pathLength} 步` : "未找到"} · 尝试{" "}
        {design.attempts} 次 · 草案 {design.seed}
      </p>
      <p className="design-explain">{design.explanation}</p>
      {design.feedbackApplied.length > 0 && (
        <p className="design-meta">本轮调整：{design.feedbackApplied.join("；")}</p>
      )}
    </div>
  );
}

export function App() {
  const gameHost = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [mode, setMode] = useState<Mode>("bridge");

  const [status, setStatus] = useState("等待你的任务");
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [agentPaused, setAgentPaused] = useState(false);
  const [bridgeTask, setBridgeTask] = useState<BridgeTaskEvent>({
    task: 1,
    title: BRIDGE_TASKS[1].title,
    objective: BRIDGE_TASKS[1].objective,
    hint: BRIDGE_TASKS[1].hint
  });
  const [bridgeDone, setBridgeDone] = useState<BridgeComplete | null>(null);
  const [bridgeBlocked, setBridgeBlocked] = useState(false);

  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [feedback, setFeedback] = useState("");
  const [editText, setEditText] = useState("");
  const [design, setDesign] = useState<DesignOutcome | null>(null);
  const [previousDesign, setPreviousDesign] = useState<DesignOutcome | null>(null);
  const [workshopStatus, setWorkshopStatus] = useState(
    "描述你想玩的挑战，墨点会先生成草案，再交给验证器实际检查。"
  );
  const [workshopResult, setWorkshopResult] = useState<WorkshopResult | null>(null);
  const [hiddenFound, setHiddenFound] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!gameHost.current) return;
    const game = createGame(gameHost.current);
    gameRef.current = game;
    const bootFromQuery = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("level") === "city") {
        setMode("city");
        return;
      }
      if (params.get("level") !== "workshop") return;
      const seed = Number(params.get("seed") ?? 42) || 42;
      const outcome = designWorkshopLevel(DEFAULT_BRIEF, { seed });
      setDesign(outcome);
      setMode("workshop");
      game.registry.set("workshop.draft", outcome.draft);
      setWorkshopStatus("演示模式：已经载入一份通过验证的关卡草案。");
      game.scene.start("workshop");
    };
    if (game.isBooted) bootFromQuery();
    else game.events.once("ready", bootFromQuery);

    const offSnapshot = gameBridge.on("snapshot", setSnapshot);
    const offComplete = gameBridge.on("workshopComplete", result => {
      setWorkshopResult(result);
      setWorkshopStatus(
        `你完成了墨点设计的关卡：用时 ${Math.round(result.elapsedMs / 1000)} 秒，转动镜子 ${result.mirrorRotations} 次。`
      );
      setLog(items => [`你通关了「${result.levelId}」，这是一次由 AI 设计的挑战。`, ...items].slice(0, 8));
    });
    const offHidden = gameBridge.on("workshopHidden", ({ logId }) => {
      setHiddenFound(true);
      setLog(items => [`你发现了隐藏记录 ${logId}。`, ...items].slice(0, 8));
    });
    const offBridgeTask = gameBridge.on("bridgeTask", event => {
      setBridgeTask(event);
      setBridgeBlocked(false);
      setStatus(`任务 ${event.task}/3 · ${event.title}：${event.objective}`);
      setLog(items => [`任务 ${event.task}：${event.objective}`, ...items].slice(0, 10));
    });
    const offBridgeComplete = gameBridge.on("bridgeComplete", result => {
      setBridgeDone(result);
      setBridgeBlocked(false);
      setStatus(`三个任务完成：墨点真实抵达对岸并启动了装置。`);
      setLog(items =>
        [
          `协作总结：用时 ${Math.round(result.elapsedMs / 1000)} 秒，引擎执行了 ${result.rulesApplied} 条规则。`,
          ...items
        ].slice(0, 10)
      );
    });
    return () => {
      offSnapshot();
      offComplete();
      offHidden();
      offBridgeTask();
      offBridgeComplete();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  async function runPhrase(phrase: string) {
    const text = phrase.trim();
    if (!text) return;
    const world = gameBridge.getSnapshot();
    if (!world) {
      setStatus("场景尚未准备完成");
      return;
    }

    const direction = mode === "bridge" ? createBridgeDirection(text, world, bridgeTask.task) : null;
    if (direction) {
      setStatus(direction.reply);
      let current = world;
      if (direction.plan) {
        const planResult = await gameBridge.execute(direction.plan);
        setHistory(items => [{ input: text, result: planResult }, ...items].slice(0, 8));
        if (planResult.status !== "completed") {
          setStatus(planResult.userMessage);
          return;
        }
        current = gameBridge.getSnapshot() ?? current;
      }
      setStatus("墨点正在执行计划…");
      const result = await gameBridge.executeAgentPolicy(direction.policy(current));
      setHistory(items => [{ input: text, result }, ...items].slice(0, 8));
      setStatus(result.userMessage);
      const rejectionCode = result.stepResults.find(step => step.status === "rejected")?.code;
      if (result.status === "rejected" && rejectionCode === "PATH_BLOCKED") {
        setLog(items => [`墨点停在半路：${result.userMessage}`, ...items].slice(0, 10));
        if (bridgeTask.task === 3) setBridgeBlocked(true);
      }
      return;
    }

    const policy = createLocalDemoPolicy(text, world);
    if (policy) {
      setStatus("墨点正在观察世界并执行计划…");
      const result = await gameBridge.executeAgentPolicy(policy);
      setHistory(items => [{ input: text, result }, ...items].slice(0, 6));
      setStatus(result.userMessage);
      return;
    }

    setStatus("正在请求 AI 规划服务…");
    const reply = await requestServerPlan(text, world, `req-ui-${Date.now()}`);
    if (reply?.kind === "plan") {
      const result = await gameBridge.execute(reply.plan);
      setHistory(items => [{ input: text, result }, ...items].slice(0, 8));
      setStatus(result.userMessage);
      return;
    }
    if (reply?.kind === "error") setStatus(reply.message);

    setStatus("AI 服务不可用，改用本地规则预检…");
    const plan: ActionPlan | null = createLocalDemoPlan(text, world);
    if (!plan) {
      setStatus("当前演示支持：走到第一块石板、用石板搭路、补上缺口，或用规则改变石头与风场");
      return;
    }

    const result = await gameBridge.execute(plan);
    setHistory(items => [{ input: text, result }, ...items].slice(0, 6));
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

  function switchMode(next: Mode) {
    setMode(next);
    setWorkshopResult(null);
    const game = gameRef.current;
    if (!game) return;
    if (next === "bridge") {
      setBridgeDone(null);
      setBridgeBlocked(false);
      game.scene.stop("workshop");
      game.scene.start("floating-bridge");
    } else if (next === "workshop") {
      game.scene.stop("floating-bridge");
      game.scene.start("workshop");
    } else {
      game.scene.stop("floating-bridge");
      game.scene.stop("workshop");
    }
  }

  function requestDesign() {
    const outcome = designWorkshopLevel(brief.trim() || "一个需要光路和跳跃的挑战");
    setPreviousDesign(design);
    setDesign(outcome);
    setWorkshopResult(null);
    setHiddenFound(false);
    gameRef.current?.registry.set("workshop.draft", outcome.draft);
    setWorkshopStatus(
      outcome.validation.ok
        ? "草案通过验证。点「试玩这一版」进入工坊，按 WASD 移动、空格跳跃、E 转动镜子。"
        : "验证器拒绝了这份草案，先根据下面的问题调整描述，或直接让我重新设计。"
    );
    setLog(items =>
      [
        `你：${brief.trim() || "一个需要光路和跳跃的挑战"}`,
        `墨点：${outcome.explanation}`,
        ...items
      ].slice(0, 8)
    );
  }

  function playCurrent() {
    if (!design) return;
    gameRef.current?.registry.set("workshop.draft", design.draft);
    setMode("workshop");
    setWorkshopResult(null);
    setHiddenFound(false);
    setWorkshopStatus("试玩中：WASD / 方向键移动，空格跳跃，靠近镜子按 E 转动。");
    gameRef.current?.scene.start("workshop");
  }

  function applyFeedback() {
    if (!design) return;
    const next = redesignWithFeedback(design, feedback);
    setPreviousDesign(design);
    setDesign(next);
    setWorkshopResult(null);
    setHiddenFound(false);
    gameRef.current?.registry.set("workshop.draft", next.draft);
    setWorkshopStatus(
      next.validation.ok ? "新版本通过验证，可以继续试玩。" : "新版本没有通过验证，请再调整一次。"
    );
    setLog(items => [`你：${feedback}`, `墨点：${next.feedbackApplied.join("；")}`, ...items].slice(0, 8));
    setFeedback("");
  }

  function applyEdit() {
    if (!design) return;
    const result = editWorkshopDraft(design.draft, editText);
    if (!result.ok) {
      setWorkshopStatus(result.message);
      return;
    }
    const validation = validateLevelDraft(result.draft);
    if (!validation.ok) {
      setWorkshopStatus(
        `这样改会不可解：${validation.issues.map(issue => issue.message).join("；") || "请换个位置试试"}。`
      );
      return;
    }
    const next: DesignOutcome = {
      ...design,
      draft: result.draft,
      validation,
      revisions: design.revisions + 1,
      feedbackApplied: [result.change]
    };
    setPreviousDesign(design);
    setDesign(next);
    setWorkshopResult(null);
    setHiddenFound(false);
    gameRef.current?.registry.set("workshop.draft", result.draft);
    setWorkshopStatus(`已改关卡：${result.change}。验证器确认仍然有解，可以试玩。`);
    setLog(items => [`你：${editText}`, `墨点：${result.change}`, ...items].slice(0, 10));
    setEditText("");
  }

  const chapter =
    mode === "bridge"
      ? "第一章 · 人制定任务，AI 自主行动"
      : mode === "workshop"
        ? "第二章 · AI 设计挑战，人来挑战"
        : "第三章 · 人与 AI 共同写规则";
  const title = mode === "bridge" ? "悬空之桥" : mode === "workshop" ? "回声工坊" : "断流之城";
  const objective =
    mode === "bridge"
      ? bridgeTask.objective
      : mode === "workshop"
        ? design?.draft.objective ?? "让墨点设计一关，你亲自试玩并评价"
        : "和墨点写出能通过七日检查的供水规则：居民、能源、生态都达标";

  return (
    <main className="app-shell">
      <header className="hud">
        <div>
          <span className="eyebrow">{chapter}</span>
          <h1>{title}</h1>
        </div>
        <nav className="chapter-tabs" aria-label="章节">
          <button type="button" data-active={mode === "bridge"} onClick={() => switchMode("bridge")}>
            第一关
          </button>
          <button type="button" data-active={mode === "workshop"} onClick={() => switchMode("workshop")}>
            第二关
          </button>
          <button type="button" data-active={mode === "city"} onClick={() => switchMode("city")}>
            第三关
          </button>
        </nav>
        <div className="objective">
          <span>目标</span>
          <strong>{objective}</strong>
        </div>
        <div className="resource">
          <span>{mode === "bridge" ? "规则能量" : mode === "workshop" ? "关卡验证" : "检查周期"}</span>
          <strong>
            {mode === "bridge"
              ? Math.round(snapshot?.budgetRemaining ?? 100)
              : mode === "workshop"
                ? design?.validation.ok
                  ? "有解"
                  : design
                    ? "未过"
                    : "待生成"
                : "7 天"}
          </strong>
        </div>
      </header>

      <section className="game-stage" aria-label="游戏画面" hidden={mode === "city"}>
        <div ref={gameHost} className="game-canvas" />
        <div className="controls-hint">
          {mode === "bridge"
            ? "你负责目标与约束 · 墨点负责观察、移动和行动"
            : "WASD 移动 · 空格跳跃 · E 转动镜子"}
        </div>
      </section>

      {mode === "city" ? (
        <CityChapter autoRun={new URLSearchParams(window.location.search).get("run") === "1"} />
      ) : (
      <section className="rule-console">
        {mode === "bridge" ? (
          <>
            <VoiceConsole onSubmit={utterance => runPhrase(utterance)} />
            <div className="bridge-actions">
              <button className="secondary" type="button" onClick={toggleAgent}>
                {agentPaused ? "继续" : "暂停"}
              </button>
              <button className="secondary" type="button" onClick={() => void undo()}>撤销</button>
            </div>
            <div className="status-line"><i />{status}</div>
            <div className="task-strip">
              <span className="task-chip">任务 {bridgeTask.task}/3 · {bridgeTask.title}</span>
              <span className="task-hint">{bridgeTask.hint}</span>
              {bridgeBlocked && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void runPhrase("用石板补上缺口")}
                >
                  让墨点重新规划
                </button>
              )}
            </div>
            <div className="object-legend" aria-label="可操控物体颜色">
              {[
                ["#4d9dff", "蓝色石板（前方）"],
                ["#46d5c8", "青色石板（中央）"],
                ["#6fe08a", "绿色石板（远处）"],
                ["#b98cff", "紫色石板（检修）"],
                ["#ffb057", "橙色木箱"],
                ["#54d9ec", "青色风场"],
                ["#ffd24a", "黄色压力机关"],
                ["#dfe9f5", "白色辅助平台"],
                ["#64f4d2", "翠绿装置"]
              ].map(([color, label]) => (
                <span key={label}>
                  <i style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
            {bridgeDone && (
              <div className="bridge-summary">
                <strong>共创总结</strong>
                <span>
                  三个任务完成 · 用时 {Math.round(bridgeDone.elapsedMs / 1000)} 秒 · 引擎执行{" "}
                  {bridgeDone.rulesApplied} 条规则 · 你们来回交流 {history.length} 次
                </span>
              </div>
            )}
            {history.length > 0 && (
              <details>
                <summary>共创记录（{history.length}）</summary>
                <ul>
                  {history.map((item, index) => (
                    <li key={`${item.result.requestId}-${index}`}>
                      <span>“{item.input}”</span>
                      <b data-status={item.result.status}>
                        {item.result.status === "completed" ? "已完成" : "未执行"}
                      </b>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <div className="workshop-console">
            <div className="rule-input-wrap">
              <button className="mic" type="button" disabled title="语音将在 B 线接入">●</button>
              <input
                value={brief}
                onChange={event => setBrief(event.target.value)}
                onKeyDown={event => event.key === "Enter" && requestDesign()}
                aria-label="描述想玩的关卡"
                placeholder="例如：我想要一关需要反射光、有点难、带隐藏区域的挑战…"
              />
              <button className="primary" type="button" onClick={requestDesign}>让墨点设计</button>
              {design && (
                <button
                  className="secondary"
                  type="button"
                  onClick={playCurrent}
                  disabled={!design.validation.ok}
                >
                  试玩这一版
                </button>
              )}
            </div>
            <div className="status-line"><i />{workshopStatus}</div>

            {design && (
              <div className="design-panel">
                <DesignReport design={design} />
                {previousDesign && (
                  <p className="version-compare">
                    上一版：路径 {previousDesign.validation.solution?.pathLength ?? "无"} 步 · 难度{" "}
                    {DIFFICULTY_LABEL[previousDesign.requirements.difficulty]}
                    {previousDesign.requirements.hidden ? " · 有隐藏区域" : " · 无隐藏区域"}
                  </p>
                )}
                <div className="feedback-row">
                  <input
                    value={feedback}
                    onChange={event => setFeedback(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && applyFeedback()}
                    aria-label="给这份设计的反馈"
                    placeholder="试玩后告诉我：太难 / 太简单 / 想要隐藏区域 / 某个地方跳不过去…"
                  />
                  <button className="secondary" type="button" onClick={applyFeedback}>按反馈修改</button>
                </div>
                <div className="feedback-row">
                  <input
                    value={editText}
                    onChange={event => setEditText(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && applyEdit()}
                    aria-label="直接修改关卡"
                    placeholder="直接改关卡：把镜子往右移一格 / 把出口往左移两格 / 去掉隐藏区域"
                  />
                  <button className="secondary" type="button" onClick={applyEdit} disabled={!design}>
                    改关卡
                  </button>
                </div>
                {workshopResult && (
                  <p className="play-result">
                    通关用时 {Math.round(workshopResult.elapsedMs / 1000)} 秒 · 镜子转动{" "}
                    {workshopResult.mirrorRotations} 次
                    {hiddenFound || workshopResult.hiddenFound ? " · 已发现隐藏记录" : ""}
                  </p>
                )}
              </div>
            )}

            {log.length > 0 && (
              <details>
                <summary>共创日志（{log.length}）</summary>
                <ul>
                  {log.map((item, index) => (
                    <li key={index}>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
      )}
    </main>
  );
}
