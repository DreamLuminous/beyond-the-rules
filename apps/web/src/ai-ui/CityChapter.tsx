import { useEffect, useState } from "react";
import type { CityAssessment, CityDayReport } from "@btr/contracts";
import {
  designCityScript,
  reviseCityScript,
  type CityDesignOutcome
} from "../integration/cityDesigner";
import { runCitySimulation } from "../game/city/runner";

type RuleViewTab = "natural" | "logic" | "code";

const WEATHER_LABEL = { normal: "晴", drought: "旱" } as const;

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function CityChapter({ autoRun = false }: { autoRun?: boolean }) {
  const [brief, setBrief] = useState("缺水的时候先保居民生活用水，再限制工业，也要给下游留一点生态流量");
  const [design, setDesign] = useState<CityDesignOutcome | null>(null);
  const [previousAssessment, setPreviousAssessment] = useState<CityAssessment | null>(null);
  const [assessment, setAssessment] = useState<CityAssessment | null>(null);
  const [feedback, setFeedback] = useState("");
  const [view, setView] = useState<RuleViewTab>("logic");
  const [exploredSparePump, setExploredSparePump] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState("描述你想要的城市运行策略，墨点会写成受限规则程序。");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !assessment) return;
    if (playhead >= assessment.reports.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setPlayhead(value => Math.min(assessment.reports.length, value + 1)),
      1100
    );
    return () => window.clearTimeout(timer);
  }, [playing, playhead, assessment]);

  useEffect(() => {
    if (!assessment || playhead < assessment.reports.length) return;
    setStatus(
      assessment.passed
        ? "七日检查通过。结果由城市模拟器逐日计算，不是模型自述。"
        : `未通过：${assessment.failures.join("；")}。先看看哪一天出了问题，再改规则。`
    );
  }, [assessment, playhead]);

  useEffect(() => {
    if (!design) {
      const outcome = designCityScript(brief, { seed: 20260824 });
      setDesign(outcome);
      setLog([`墨点：${outcome.explanation}`]);
    }
  }, [design, brief]);

  useEffect(() => {
    if (autoRun && design && !assessment) run();
  }, [autoRun, design, assessment]);

  function pushLog(text: string) {
    setLog(items => [text, ...items].slice(0, 10));
  }

  function generate() {
    const outcome = designCityScript(brief, { seed: Date.now() % 1_000_000_000 });
    setDesign(outcome);
    setAssessment(null);
    setPreviousAssessment(null);
    setPlayhead(0);
    setPlaying(false);
    setStatus("规则已生成。先看逻辑或代码，再运行七日模拟让引擎给出真实结果。");
    pushLog(`你：${brief}`);
    pushLog(`墨点：${outcome.explanation}`);
  }

  function run() {
    if (!design) return;
    const next = runCitySimulation(design.script, { exploredSparePump });
    setPreviousAssessment(assessment);
    setAssessment(next);
    setPlayhead(1);
    setPlaying(true);
    setStatus("城市开始运转：逐日观察水库、供水、能源与生态的变化。");
    pushLog("你：开始七日模拟（可以暂停、单步推进或跳到结果）。");
  }

  function revise() {
    if (!design || !feedback.trim()) return;
    const next = reviseCityScript(design, feedback, { exploredSparePump });
    setDesign(next);
    setAssessment(null);
    setPlayhead(0);
    setPlaying(false);
    setStatus("已按反馈生成新版本。旧版本的运行结果保留在下方对比。");
    pushLog(`你：${feedback}`);
    pushLog(`墨点：${next.changes.join("；")}`);
    setFeedback("");
  }

  function inspectPump() {
    if (exploredSparePump) return;
    setExploredSparePump(true);
    setStatus("你在泵站值班室找到一份维护记录：还有一台备用泵，可以在故障时顶替。");
    pushLog("你：巡查泵站，发现备用泵维护记录（现在可以让墨点启用它）。");
  }

  const visibleReports = assessment ? assessment.reports.slice(0, playhead) : [];
  const lastReport: CityDayReport | undefined = visibleReports[visibleReports.length - 1];
  const reportsByDay = new Map(visibleReports.map(report => [report.day, report]));
  const finished = Boolean(assessment && playhead >= assessment.reports.length);
  const minEnergy = assessment ? Math.min(...assessment.reports.map(report => report.energyReliability)) : null;

  return (
    <div className="city-chapter">
      <section className="city-board" aria-label="城市状态">
        <div className="city-board-head">
          <div>
            <span className="eyebrow">断流之城 · 城市状态</span>
            <strong>
              {assessment
                ? finished
                  ? "七日结束"
                  : `第 ${Math.max(1, playhead)}/7 天 · 运行中`
                : "尚未运行模拟"}
            </strong>
          </div>
          <div
            className={`city-verdict ${
              assessment && finished ? (assessment.passed ? "ok" : "bad") : "idle"
            }`}
          >
            {assessment
              ? finished
                ? assessment.passed
                  ? "七日检查通过"
                  : "七日检查未通过"
                : playing
                  ? "观察中…"
                  : "已暂停"
              : "等待运行"}
          </div>
        </div>

        <div className="city-day-strip">
          {Array.from({ length: 7 }, (_, index) => {
            const day = index + 1;
            const report = reportsByDay.get(day);
            return (
              <div
                key={day}
                className="city-day"
                data-weather={report?.weather ?? (day === 3 || day === 4 ? "drought" : "normal")}
                data-alert={report ? report.energyReliability < 75 || report.residentialSupply < 90 : false}
                data-current={Boolean(assessment) && !finished && day === playhead}
              >
                <b>第 {day} 天</b>
                <span>{report ? WEATHER_LABEL[report.weather] : day === 3 || day === 4 ? "旱" : "晴"}</span>
                <small>
                  {report
                    ? `水 ${Math.round(report.reservoir)}${
                        report.events.some(event => event.includes("泵站")) ? " · 泵停" : ""
                      }`
                    : assessment
                      ? "待运行"
                      : "—"}
                </small>
              </div>
            );
          })}
        </div>

        {lastReport && lastReport.events.length > 0 && (
          <div className="city-event" data-weather={lastReport.weather}>
            <b>第 {lastReport.day} 天</b> · {lastReport.events.join(" · ")}
          </div>
        )}

        <div className="city-grid">
          <article className="city-card">
            <span>水库</span>
            <strong>{Math.round(lastReport?.reservoir ?? 70)}</strong>
            <div className="city-bar">
              <i style={{ width: `${Math.min(100, lastReport?.reservoir ?? 70)}%` }} />
            </div>
            <small>警戒线 30 · 低于它进入告急配水</small>
            <button type="button" className="link" onClick={() => pushLog("你：巡查水库，确认警戒线和当日来水。")}>
              巡查
            </button>
          </article>
          <article className="city-card" data-tone={exploredSparePump ? "ok" : "warn"}>
            <span>泵站</span>
            <strong>
              {lastReport?.events.some(event => event.includes("泵站"))
                ? "故障中"
                : exploredSparePump
                  ? "备用泵可用"
                  : "主泵运行"}
            </strong>
            <small>{exploredSparePump ? "故障时可顶替，供电惩罚更小" : "维护记录里还藏着什么？"}</small>
            <button type="button" className="link" onClick={inspectPump} disabled={exploredSparePump}>
              {exploredSparePump ? "已巡查" : "巡查泵站"}
            </button>
          </article>
          <article className="city-card">
            <span>农田</span>
            <strong>{percent(lastReport?.soilMoisture ?? 48)}</strong>
            <div className="city-bar">
              <i style={{ width: `${Math.min(100, lastReport?.soilMoisture ?? 48)}%` }} />
            </div>
            <small>湿度低于 35 需要灌溉，但会挤占居民用水</small>
            <button type="button" className="link" onClick={() => pushLog("你：巡查农田，记下土壤湿度阈值。")}>
              巡查
            </button>
          </article>
          <article className="city-card">
            <span>工厂</span>
            <strong>{percent(lastReport?.industryOutput ?? 100)}</strong>
            <div className="city-bar">
              <i style={{ width: `${Math.min(100, lastReport?.industryOutput ?? 100)}%` }} />
            </div>
            <small>工业上限越低，越省水也越省电</small>
          </article>
          <article className="city-card">
            <span>居民区</span>
            <strong>{percent(lastReport?.residentialSupply ?? 100)}</strong>
            <div className="city-bar">
              <i style={{ width: `${Math.min(100, lastReport?.residentialSupply ?? 100)}%` }} />
            </div>
            <small>通关要求七日平均 ≥ 90%</small>
          </article>
          <article className="city-card">
            <span>生态</span>
            <strong>{percent(lastReport?.ecologyIndex ?? 70)}</strong>
            <div className="city-bar">
              <i style={{ width: `${Math.min(100, lastReport?.ecologyIndex ?? 70)}%` }} />
            </div>
            <small>下游流量不足会让生态指数持续下降</small>
          </article>
        </div>

        {finished && assessment && (
          <div className="city-summary">
            <span>居民均值 {percent(assessment.averageResidentialSupply)}</span>
            <span>能源均值 {percent(assessment.averageEnergyReliability)}</span>
            <span>最低能源 {percent(minEnergy ?? 0)}</span>
            <span>生态最低 {percent(assessment.minEcologyIndex)}</span>
            <span>水库最低 {Math.round(assessment.minimumReservoir)}</span>
          </div>
        )}
      </section>

      <section className="city-console">
        <div className="rule-input-wrap">
          <button className="mic" type="button" disabled title="语音将在后续接入">●</button>
          <input
            value={brief}
            onChange={event => setBrief(event.target.value)}
            onKeyDown={event => event.key === "Enter" && generate()}
            aria-label="描述城市策略"
            placeholder="例如：缺水时先保居民，再限制工业，也要照顾下游生态…"
          />
          <button className="primary" type="button" onClick={generate}>让墨点写规则</button>
          <button className="secondary" type="button" onClick={run} disabled={!design}>
            {assessment ? "重新运行" : "运行七日"}
          </button>
          {assessment && !finished && (
            <>
              <button className="secondary" type="button" onClick={() => setPlaying(value => !value)}>
                {playing ? "暂停" : "继续"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setPlayhead(value => Math.min(assessment.reports.length, value + 1));
                }}
              >
                下一天
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setPlayhead(assessment.reports.length);
                }}
              >
                跳到结果
              </button>
            </>
          )}
          {assessment && finished && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setPlayhead(1);
                setPlaying(true);
              }}
            >
              重看过程
            </button>
          )}
        </div>
        <div className="status-line"><i />{status}</div>

        {design && (
          <div className="city-design">
            <div className="city-design-head">
              <div>
                <span className="design-kicker">规则草案 · 第 {design.revisions} 版 · {design.script.rules.length} 条规则</span>
                <strong>{design.script.name}</strong>
              </div>
              <div className="view-tabs">
                {([
                  ["natural", "自然语言"],
                  ["logic", "可视化逻辑"],
                  ["code", "规则代码"]
                ] as const).map(([key, label]) => (
                  <button key={key} type="button" data-active={view === key} onClick={() => setView(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {view === "natural" && (
              <div className="city-natural">
                <p>{design.explanation}</p>
                <div className="city-tags">
                  {design.requirements.protectResidents && <span>居民优先</span>}
                  {design.requirements.protectEcology && <span>生态下限</span>}
                  {design.requirements.saveWater && <span>限制工业</span>}
                  {design.requirements.useSparePump && <span>启用备用泵</span>}
                  {design.requirements.simple && <span>精简规则</span>}
                </div>
                {design.requirements.unsupported.length > 0 && (
                  <p className="city-unsupported">未支持：{design.requirements.unsupported.join("；")}</p>
                )}
              </div>
            )}

            {view === "logic" && (
              <ol className="rule-list">
                {design.views.map(ruleView => (
                  <li key={ruleView.id}>
                    <b>{ruleView.condition}</b>
                    <span>{ruleView.actions.join("；")}</span>
                  </li>
                ))}
              </ol>
            )}

            {view === "code" && <pre className="rule-code">{design.code}</pre>}
          </div>
        )}

        {assessment && (
          <div className="city-results">
            <table className="city-table">
              <thead>
                <tr>
                  <th>天</th>
                  <th>天气</th>
                  <th>水库</th>
                  <th>居民</th>
                  <th>能源</th>
                  <th>生态</th>
                  <th>事件</th>
                  <th>生效规则</th>
                </tr>
              </thead>
              <tbody>
                {visibleReports.map(report => (
                  <tr key={report.day} data-alert={report.energyReliability < 75 || report.residentialSupply < 90}>
                    <td>{report.day}</td>
                    <td>{WEATHER_LABEL[report.weather]}</td>
                    <td>{Math.round(report.reservoir)}</td>
                    <td>{percent(report.residentialSupply)}</td>
                    <td>{percent(report.energyReliability)}</td>
                    <td>{percent(report.ecologyIndex)}</td>
                    <td>{report.events.join("；") || "—"}</td>
                    <td>{report.activeRuleId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {finished && assessment.failures.length > 0 && (
              <ul className="city-failures">
                {assessment.failures.map(failure => <li key={failure}>{failure}</li>)}
              </ul>
            )}
            {previousAssessment && (
              <p className="version-compare">
                上一版：居民均值 {percent(previousAssessment.averageResidentialSupply)} · 最低能源{" "}
                {percent(Math.min(...previousAssessment.reports.map(report => report.energyReliability)))} ·{" "}
                {previousAssessment.passed ? "通过" : "未通过"}
              </p>
            )}
          </div>
        )}

        <div className="feedback-row">
          <input
            value={feedback}
            onChange={event => setFeedback(event.target.value)}
            onKeyDown={event => event.key === "Enter" && revise()}
            aria-label="给规则的反馈"
            placeholder="运行后告诉我：居民还是不够 / 规则太多 / 用备用泵 / 再压一压工业…"
          />
          <button className="secondary" type="button" onClick={revise} disabled={!design}>
            按反馈修改
          </button>
        </div>

        {log.length > 0 && (
          <details>
            <summary>共创日志（{log.length}）</summary>
            <ul>
              {log.map((item, index) => (
                <li key={index}><span>{item}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
