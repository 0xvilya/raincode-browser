import { useEffect, useState } from "react";
import type { BrowserState, Command } from "../shared/contracts";
import { send, useBrowser } from "./store";
import { developerText } from "./developer-i18n";
import { CommandConsole } from "./CommandConsole";
import "./developer-workspace.css";

interface Tree {
  root: string;
  entries: { path: string; directory: boolean }[];
  truncated: boolean;
}
interface RequestRecord {
  url: string;
  method: string;
  status: number;
  elapsed: number;
}

export function DeveloperWorkspace({ browser }: { browser: BrowserState }) {
  const t = (key: Parameters<typeof developerText>[1]) =>
    developerText(browser.settings.locale, key);
  const candidates = browser.tabs.filter((tab) => /^https?:\/\//.test(tab.url));
  const { developerTargetId: target, setDeveloperTargetId: setTarget } =
    useBrowser();
  const selected = candidates.find((tab) => tab.id === target);
  useEffect(() => {
    if (!candidates.some((tab) => tab.id === target))
      setTarget(candidates.at(-1)?.id || "");
  }, [browser.tabs, target, setTarget]);
  const [mode, setMode] = useState<"detach" | "right" | "bottom" | "undocked">(
    "detach",
  );
  const [tree, setTree] = useState<Tree>();
  const [source, setSource] = useState<{ path: string; source: string }>();
  const [network, setNetwork] = useState<RequestRecord[]>([]);
  const [notes, setNotes] = useState(browser.notes);
  const [snippet, setSnippet] = useState(browser.snippets);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNotes(browser.notes);
  }, [browser.notes]);
  useEffect(() => {
    setSnippet(browser.snippets);
  }, [browser.snippets]);
  useEffect(() => {
    setTree(undefined);
    setSource(undefined);
  }, [browser.projectPath]);
  useEffect(() => {
    setNetwork([]);
  }, [target]);

  async function execute(payload: Command, accept?: (data: unknown) => void) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await send(payload);
      if (!result.ok) {
        setOutput(result.error || t("failed"));
        return;
      }
      if (accept) accept(result.data);
      else if (typeof result.data === "object" && result.data !== null) {
        const value = result.data as {
          cancelled?: boolean;
          output?: string;
          exitCode?: number;
          timedOut?: boolean;
          saved?: boolean;
        };
        setOutput(
          value.cancelled
            ? t("cancelled")
            : value.saved
              ? t("saved")
              : `${value.output || ""}${value.exitCode !== undefined ? `\n${t("exit")}: ${value.exitCode}` : ""}${value.timedOut ? `\n${t("timedOut")}` : ""}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="developer-workspace" aria-label={t("title")}>
      <section className="section developer-target">
        <h2>{t("title")}</h2>
        <p className="hint">{t("subtitle")}</p>
        <label>
          {t("target")}
          <select
            value={selected ? target : ""}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="" disabled>
              {t("noTarget")}
            </option>
            {candidates.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.title} — {new URL(tab.url).origin}
              </option>
            ))}
          </select>
        </label>
        {selected && <p className="mono developer-origin">{selected.url}</p>}
        <div className="button-row">
          <select
            aria-label={t("tools")}
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            {(["detach", "right", "bottom", "undocked"] as const).map(
              (item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ),
            )}
          </select>
          <button
            className="button primary"
            disabled={!selected || busy}
            onClick={() =>
              void execute({ type: "dev.tools", tabId: target, mode })
            }
          >
            {t("tools")}
          </button>
        </div>
      </section>
      <section className="section">
        <h2>{t("network")}</h2>
        <p className="hint">{t("networkHint")}</p>
        <div className="button-row">
          <button
            className="button"
            disabled={!selected || busy}
            onClick={() =>
              void execute(
                { type: "dev.recording", tabId: target, enabled: true },
                () => setNetwork([]),
              )
            }
          >
            {browser.settings.locale === "ru"
              ? "Начать запись выбранной вкладки"
              : "Start recording selected tab"}
          </button>
          <button
            className="button"
            disabled={!selected || busy}
            onClick={() =>
              void execute(
                { type: "dev.recording", tabId: target, enabled: false },
                () => setNetwork([]),
              )
            }
          >
            {browser.settings.locale === "ru"
              ? "Остановить и очистить запись"
              : "Stop and clear recording"}
          </button>
          <button
            className="button"
            disabled={!selected || busy}
            onClick={() =>
              void execute({ type: "dev.network", tabId: target }, (value) =>
                setNetwork(
                  Array.isArray(value) ? (value as RequestRecord[]) : [],
                ),
              )
            }
          >
            {t("refresh")}
          </button>
          <button
            className="button"
            disabled={!selected || busy}
            onClick={() => void execute({ type: "dev.har", tabId: target })}
          >
            {t("har")}
          </button>
        </div>
        <div
          className="developer-network"
          role="region"
          aria-label={t("network")}
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>{t("method")}</th>
                <th>{t("status")}</th>
                <th>{t("address")}</th>
                <th>{t("elapsed")}</th>
              </tr>
            </thead>
            <tbody>
              {network.map((entry, index) => (
                <tr key={`${entry.url}-${index}`}>
                  <td>{entry.method}</td>
                  <td>{entry.status}</td>
                  <td className="mono">{entry.url}</td>
                  <td>{entry.elapsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!network.length && <p className="hint">{t("empty")}</p>}
        </div>
      </section>
      <section className="section">
        <h2>{t("project")}</h2>
        <p className="mono">{browser.projectPath || t("noProject")}</p>
        <div className="button-row">
          <button
            className="button"
            disabled={busy}
            onClick={() => void execute({ type: "action", action: "project" })}
          >
            {t("choose")}
          </button>
          <button
            className="button"
            disabled={!browser.projectPath || busy}
            onClick={() =>
              void execute({ type: "dev.tree" }, (value) =>
                setTree(value as Tree),
              )
            }
          >
            {t("tree")}
          </button>
        </div>
        <p className="hint">{t("treeHint")}</p>
        {tree && (
          <div className="developer-source-layout">
            <div
              className="developer-tree"
              role="region"
              aria-label={t("project")}
              tabIndex={0}
            >
              {tree.entries.map((entry) =>
                entry.directory ? (
                  <p key={entry.path} className="developer-directory mono">
                    {entry.path}/
                  </p>
                ) : (
                  <button
                    className={`developer-file mono ${entry.path === source?.path ? "selected" : ""}`}
                    key={entry.path}
                    disabled={busy}
                    title={entry.path}
                    onClick={() =>
                      void execute(
                        { type: "dev.read", path: entry.path },
                        (value) => setSource(value as typeof source),
                      )
                    }
                  >
                    {entry.path}
                  </button>
                ),
              )}
              {tree.truncated && <p className="hint">{t("truncated")}</p>}
            </div>
            <div className="developer-source">
              <h3>{source?.path || t("source")}</h3>
              <pre tabIndex={0} aria-label={t("source")}>
                {source?.source || t("selectFile")}
              </pre>
            </div>
          </div>
        )}
      </section>
      <div className="settings-grid">
        <section className="section">
          <h2>{t("notes")}</h2>
          <textarea
            aria-label={t("notes")}
            rows={10}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={100000}
          />
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void execute(
                { type: "notes.save", notes, snippets: snippet },
                () => setOutput(t("saved")),
              )
            }
          >
            {t("save")}
          </button>
        </section>
        <section className="section">
          <h2>{t("snippets")}</h2>
          <p className="hint">{t("snippetHint")}</p>
          <textarea
            className="mono"
            aria-label={t("snippets")}
            rows={10}
            value={snippet}
            onChange={(event) => setSnippet(event.target.value)}
            maxLength={100000}
            spellCheck={false}
          />
          <button
            className="button"
            disabled={!selected || !snippet.trim() || busy}
            onClick={() =>
              void execute({
                type: "dev.snippet",
                tabId: target,
                code: snippet,
              })
            }
          >
            {t("run")}
          </button>
        </section>
      </div>
      <CommandConsole
        key={browser.projectPath || "no-project"}
        locale={browser.settings.locale}
        projectPath={browser.projectPath}
        disabled={busy}
        onRunningChange={setBusy}
      />
      <section className="section">
        <h2>{t("output")}</h2>
        <pre className="developer-output mono" aria-live="polite" tabIndex={0}>
          {busy ? t("working") : output || t("empty")}
        </pre>
      </section>
    </div>
  );
}
