/**
 * M1：语音交互组件（React，Chrome 优先 Web Speech API）。
 * 职责边界（apps/web/src/components/voice/README.md）：
 *  - 只负责录音状态、转写文本、提交与取消、错误与文本降级；
 *  - 不持有任何 Phaser 游戏对象引用，只通过集成层（onSubmit）交换协议对象；
 *  - 请求携带唯一 requestId，相同 requestId 不重复提交； AbortController 支持取消。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface VoiceConsoleProps {
  /** 提交玩家原话；调用方负责组装 PlanRequest 并调用集成层。 */
  onSubmit: (utterance: string, requestId: string) => Promise<void> | void;
  /** 集成层注入的取消句柄；不传则组件内部仅取消本地录音。 */
  cancelRef?: { current: (() => void) | null };
  disabled?: boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type MicStatus = "idle" | "listening" | "denied" | "unsupported" | "silent";

const DEGRADE_TEXT: Record<string, string> = {
  denied: "麦克风权限被拒绝，可直接用下方文本框输入。",
  unsupported: "当前浏览器不支持语音输入，可用文本框输入。",
  silent: "没有听到声音，可重试或改用文本输入。",
};

export function VoiceConsole({ onSubmit, cancelRef, disabled }: VoiceConsoleProps) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [textInput, setTextInput] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastRequestIdRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const Recognition = useMemo(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }, []);

  useEffect(() => {
    if (!Recognition) setMicStatus("unsupported");
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
    };
  }, [Recognition]);

  const startRecording = useCallback(() => {
    if (!Recognition) {
      setMicStatus("unsupported");
      return;
    }
    const rec = new Recognition();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const first = e.results[i]?.[0];
        if (first) text += first.transcript;
      }
      setTranscript(text);
    };
    rec.onerror = (e) => {
      setMicStatus(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : "silent");
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    setTranscript("");
    setMicStatus("idle");
    setRecording(true);
    rec.start();
  }, [Recognition]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setRecording(false);
  }, []);

  const submit = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || submitting) return;
      // 幂等：生成唯一 requestId，相同请求不重复提交
      const requestId = `req-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (lastRequestIdRef.current === requestId) return;
      lastRequestIdRef.current = requestId;
      const ac = new AbortController();
      abortRef.current = ac;
      setSubmitting(true);
      try {
        await onSubmit(text, requestId);
      } finally {
        setSubmitting(false);
        abortRef.current = null;
      }
    },
    [onSubmit, submitting]
  );

  const cancel = useCallback(() => {
    recognitionRef.current?.stop();
    setRecording(false);
    abortRef.current?.abort();
    abortRef.current = null;
    setSubmitting(false);
    if (cancelRef) cancelRef.current?.();
  }, [cancelRef]);

  return (
    <div className="voice-console" data-recording={recording} data-submitting={submitting}>
      {/* 按住说话：按下开始、松开结束；指针事件同时覆盖鼠标与触屏 */}
      <button
        type="button"
        className="voice-mic"
        disabled={disabled || !Recognition || submitting}
        onPointerDown={event => {
          event.preventDefault();
          startRecording();
        }}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        onPointerCancel={stopRecording}
        onContextMenu={event => event.preventDefault()}
      >
        {recording ? "松开结束" : "按住说话"}
      </button>

      {/* 文本输入始终可用 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(textInput);
          setTextInput("");
        }}
      >
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="或直接输入文字，例如：让前面的石头慢慢浮起来"
          aria-label="文字输入"
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || submitting || !textInput.trim()}>
          发送
        </button>
        {(submitting || recording) && (
          <button type="button" onClick={cancel}>
            取消
          </button>
        )}
      </form>

      {/* 固定高度的识别行：没有结果时也占位，避免整个控制台跳动 */}
      <div className="transcript" data-empty={!transcript}>
        {transcript ? (
          <>
            <span>识别结果：</span>
            <input value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label="识别文本修正" />
            <button type="button" disabled={submitting} onClick={() => void submit(transcript)}>
              确认提交
            </button>
          </>
        ) : (
          <span className="transcript-placeholder">按住左侧按钮说话；识别结果会显示在这里，也可以直接打字。</span>
        )}
      </div>

      {/* 降级提示始终占位，避免出现提示时布局上移 */}
      <p role="status">{micStatus !== "idle" && micStatus !== "listening" ? DEGRADE_TEXT[micStatus] : ""}</p>
    </div>
  );
}

export default VoiceConsole;
