import { useEffect, useRef, useState } from "react";
import type { BrowserState, Tab } from "../shared/contracts";
import { splitRects, SPLIT_TOOLBAR_HEIGHT } from "../shared/split-view";
import { send } from "./store";
import { splitText } from "./split-i18n";
import "./split.css";

function PaneBar({
  tab,
  pane,
  browser,
}: {
  tab: Tab;
  pane: "first" | "second";
  browser: BrowserState;
}) {
  const t = (key: Parameters<typeof splitText>[1]) =>
    splitText(browser.settings.locale, key);
  const [address, setAddress] = useState(tab.url);
  const composing = useRef(false);
  useEffect(() => setAddress(tab.url), [tab.url]);
  const action = (value: "back" | "forward" | "reload" | "stop" | "devtools") =>
    void send({ type: "pane.action", tabId: tab.id, action: value });
  return (
    <form
      className="split-pane-bar"
      aria-label={t(pane)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!composing.current)
          void send({ type: "pane.navigate", tabId: tab.id, url: address });
      }}
    >
      <button
        type="button"
        title={t("back")}
        aria-label={t("back")}
        disabled={!tab.canGoBack}
        onClick={() => action("back")}
      >
        ←
      </button>
      <button
        type="button"
        title={t("forward")}
        aria-label={t("forward")}
        disabled={!tab.canGoForward}
        onClick={() => action("forward")}
      >
        →
      </button>
      <button
        type="button"
        title={t(tab.loading ? "stop" : "reload")}
        aria-label={t(tab.loading ? "stop" : "reload")}
        onClick={() => action(tab.loading ? "stop" : "reload")}
      >
        {tab.loading ? "×" : "↻"}
      </button>
      <input
        aria-label={t("address")}
        value={address}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => setAddress(event.target.value)}
        onFocus={() => void send({ type: "tab.activate", id: tab.id })}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !composing.current) {
            setAddress(tab.url);
            event.currentTarget.blur();
          }
        }}
      />
      <select
        aria-label={t("page")}
        value={tab.id}
        onChange={(event) =>
          void send({ type: "pane.assign", pane, tabId: event.target.value })
        }
      >
        {browser.tabs
          .filter((item) => /^https?:/.test(item.url))
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
      </select>
      <button
        type="button"
        title={t("tools")}
        aria-label={t("tools")}
        onClick={() => action("devtools")}
      >
        {"</>"}
      </button>
    </form>
  );
}

export function SplitPanes({
  browser,
  topOffset = 0,
}: {
  browser: BrowserState;
  topOffset?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const t = (key: Parameters<typeof splitText>[1]) =>
    splitText(browser.settings.locale, key);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const first = browser.tabs.find((tab) => tab.id === browser.splitPrimaryId);
  const second = browser.tabs.find((tab) => tab.id === browser.splitTabId);
  const orientation = browser.splitOrientation || "horizontal";
  const ratio = browser.splitRatio || 0.5;
  const rects = splitRects({ x: 0, y: 0, ...size }, orientation, ratio);
  return (
    <div
      className="split-surface"
      ref={root}
      style={{ top: topOffset }}
      aria-label={t("title")}
      role="group"
    >
      <div className="split-controls">
        <select
          aria-label={t("title")}
          value={orientation}
          onChange={(event) =>
            void send({
              type: "split.configure",
              orientation: event.target.value as "horizontal" | "vertical",
            })
          }
        >
          <option value="horizontal">{t("horizontal")}</option>
          <option value="vertical">{t("vertical")}</option>
        </select>
        <label>
          {t("ratio")}{" "}
          <input
            aria-label={t("ratio")}
            type="range"
            min="25"
            max="75"
            value={Math.round(ratio * 100)}
            onChange={(event) =>
              void send({
                type: "split.configure",
                ratio: Number(event.target.value) / 100,
              })
            }
          />
        </label>
        <button
          className="button"
          onClick={() => void send({ type: "split.configure", swap: true })}
        >
          {t("swap")}
        </button>
        <button className="button" onClick={() => void send({ type: "split" })}>
          {t("close")}
        </button>
      </div>
      {(
        [
          [first, "first"],
          [second, "second"],
        ] as const
      ).map(
        ([tab, pane]) =>
          tab && (
            <div
              key={tab.id}
              className={`split-pane ${browser.activeTabId === tab.id ? "focused" : ""}`}
              style={{
                left: rects[pane].x,
                top: rects[pane].y,
                width: rects[pane].width,
                height: rects[pane].height,
              }}
            >
              <PaneBar tab={tab} pane={pane} browser={browser} />
              {tab.error && (
                <div
                  className="split-error"
                  role="alert"
                  style={{ top: SPLIT_TOOLBAR_HEIGHT }}
                >
                  <p>{tab.error}</p>
                  <button
                    className="button"
                    onClick={() =>
                      void send({
                        type: "pane.action",
                        tabId: tab.id,
                        action: "reload",
                      })
                    }
                  >
                    {t("retry")}
                  </button>
                </div>
              )}
            </div>
          ),
      )}
    </div>
  );
}
