import { useEffect, useRef, useState } from "react";
import { send } from "./store";
import { commandConsoleText } from "./command-console-i18n";
import "./command-console.css";

interface CommandOutput {
  output?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  cancelled?: boolean;
  terminated?: boolean;
  truncated?: boolean;
}
interface TranscriptEntry {
  command: string;
  output: string;
  status: string;
}

export function CommandConsole({
  locale,
  projectPath,
  disabled,
  onRunningChange,
}: {
  locale: "ru" | "en";
  projectPath?: string;
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
}) {
  const t = commandConsoleText(locale);
  const input = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const runningNow = useRef(false);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>();
  const draft = useRef("");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (runningNow.current) {
        void send({ type: "dev.command.cancel" });
        onRunningChange(false);
      }
    };
  }, [onRunningChange]);

  async function execute() {
    const requested = command.trim();
    if (runningNow.current || disabled || !projectPath || !requested) return;
    runningNow.current = true;
    setRunning(true);
    setNotice("");
    onRunningChange(true);
    setHistory((items) =>
      [...items.filter((item) => item !== requested), requested].slice(-30),
    );
    setHistoryIndex(undefined);
    draft.current = "";
    setCommand("");
    try {
      const result = await send({ type: "dev.command", command: requested });
      if (!mounted.current) return;
      const data = (result.data || {}) as CommandOutput;
      const status = !result.ok
        ? result.error || t.failed
        : [
            data.cancelled ? t.cancelled : "",
            data.terminated ? t.terminated : "",
            data.exitCode !== undefined && data.exitCode !== null
              ? `${t.exit}: ${data.exitCode}`
              : "",
            data.timedOut ? t.timedOut : "",
            data.truncated ? t.truncated : "",
          ]
            .filter(Boolean)
            .join(" · ");
      setEntries((items) =>
        [
          ...items,
          {
            command: requested,
            output: String(data.output || "").slice(0, 65536),
            status,
          },
        ].slice(-8),
      );
    } finally {
      runningNow.current = false;
      if (mounted.current) {
        setRunning(false);
        setStopping(false);
        onRunningChange(false);
        requestAnimationFrame(() => input.current?.focus());
      }
    }
  }

  async function stop() {
    if (stopping || !runningNow.current) return;
    setStopping(true);
    const result = await send({ type: "dev.command.cancel" });
    if (mounted.current && !result.ok) {
      setNotice(result.error || t.failed);
      setStopping(false);
    }
  }

  function recall(direction: -1 | 1) {
    if (!history.length) return;
    if (historyIndex === undefined) draft.current = command;
    const index =
      direction === -1
        ? Math.max(0, (historyIndex ?? history.length) - 1)
        : Math.min(history.length, (historyIndex ?? history.length) + 1);
    const value = index === history.length ? draft.current : history[index];
    setHistoryIndex(index === history.length ? undefined : index);
    setCommand(value);
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(value.length, value.length),
    );
  }

  const transcript = entries
    .map(
      (entry) =>
        `$ ${entry.command}\n${entry.output}${entry.status ? `\n${entry.status}` : ""}`,
    )
    .join("\n\n");
  return (
    <section className="section command-console" aria-label={t.title}>
      <div className="command-console-heading">
        <h2>{t.title}</h2>
        <span
          className={`command-console-state ${running ? "running" : ""}`}
          role="status"
        >
          {running ? t.working : t.idle}
        </span>
      </div>
      <p className="hint">{t.hint}</p>
      <p className="command-console-directory mono">
        <span>{t.directory}: </span>
        {projectPath || t.noProject}
      </p>
      <pre
        className="command-console-transcript mono"
        aria-label={t.output}
        tabIndex={0}
        dir="ltr"
      >
        {transcript || t.empty}
      </pre>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void execute();
        }}
      >
        <label className="command-console-input-label">
          {t.command}
          <textarea
            ref={input}
            className="mono"
            aria-label={t.command}
            placeholder={t.placeholder}
            rows={2}
            maxLength={4096}
            value={command}
            spellCheck={false}
            disabled={disabled || running || !projectPath}
            onChange={(event) => {
              setCommand(event.target.value);
              setHistoryIndex(undefined);
            }}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              )
                return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void execute();
              } else if (
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                !event.ctrlKey &&
                !event.altKey &&
                !event.shiftKey &&
                (!command.includes("\n") ||
                  (event.key === "ArrowUp"
                    ? event.currentTarget.selectionStart === 0
                    : event.currentTarget.selectionEnd === command.length))
              ) {
                event.preventDefault();
                recall(event.key === "ArrowUp" ? -1 : 1);
              }
            }}
          />
        </label>
        <p className="hint">{t.keys}</p>
        <div className="button-row">
          <button
            type="submit"
            className="button primary"
            disabled={disabled || running || !projectPath || !command.trim()}
          >
            {t.execute}
          </button>
          <button
            type="button"
            className="button"
            disabled={!running || stopping}
            onClick={() => void stop()}
          >
            {stopping ? t.stopping : t.stop}
          </button>
          <button
            type="button"
            className="button"
            disabled={!entries.length || running}
            onClick={() => {
              setEntries([]);
              setHistory([]);
              setHistoryIndex(undefined);
              draft.current = "";
              setNotice("");
            }}
          >
            {t.clear}
          </button>
          <button
            type="button"
            className="button"
            disabled={!transcript}
            onClick={() => {
              void send({ type: "clipboard.write", text: transcript }).then(
                (result) => {
                  if (mounted.current)
                    setNotice(result.ok ? t.copied : t.copyFailed);
                },
              );
            }}
          >
            {t.copy}
          </button>
        </div>
      </form>
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
