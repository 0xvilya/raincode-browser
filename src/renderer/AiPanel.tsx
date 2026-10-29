import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquareText, PlugZap, Shield, X } from "lucide-react";
import type { BrowserState } from "../shared/contracts";
import type {
  AiChatEvent,
  AiChatMessage,
  AiProviderConfig,
  AiContextPreview,
} from "../shared/ai-types";
import { isLocalAiProvider } from "../shared/ai-types";
import { aiText, aiErrorText } from "./ai-i18n";
import { send, useBrowser } from "./store";
import "./ai-panel.css";

type Section = "chat" | "connection" | "privacy";
type Kind = AiProviderConfig["kind"];

function emptyConfig(profileId: string, kind: Kind): AiProviderConfig {
  return {
    id: crypto.randomUUID(),
    profileId,
    kind,
    endpoint:
      kind === "ollama"
        ? "http://127.0.0.1:11434"
        : kind === "local-openai"
          ? "http://127.0.0.1:1234/v1"
          : "",
    model: "",
    vision: false,
  };
}

type AiPanelProps = {
  browser: BrowserState;
  onClose: () => void;
};

export function AiPanel(props: AiPanelProps) {
  const profileId =
    props.browser.tabs.find((tab) => tab.id === props.browser.activeTabId)
      ?.profileId || "default";
  // A profile boundary also destroys unsent text, secrets and pending UI state.
  // Late responses belong to the unmounted instance, never the next profile.
  return <ProfileAiPanel key={profileId} {...props} />;
}

function ProfileAiPanel({ browser, onClose }: AiPanelProps) {
  const t = (key: Parameters<typeof aiText>[1]) =>
    aiText(browser.settings.locale, key);
  const activeTab = browser.tabs.find((tab) => tab.id === browser.activeTabId);
  const profileId = activeTab?.profileId || "default";
  const profile = browser.profiles.find((item) => item.id === profileId);
  const [section, setSection] = useState<Section>("chat");
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AiProviderConfig>(() =>
    emptyConfig(profileId, "ollama"),
  );
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const reviewDraft = useBrowser((state) => state.aiReviewDraft);
  useEffect(() => {
    if (!reviewDraft) return;
    if (reviewDraft.profileId === profileId) {
      setPrompt(reviewDraft.text);
      setSection("chat");
    }
    useBrowser.getState().setAiReviewDraft(null);
  }, [reviewDraft, profileId]);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previews, setPreviews] = useState<AiContextPreview[]>([]);
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [sourceChoice, setSourceChoice] = useState("active");
  const [contextKind, setContextKind] = useState<"page" | "css">("page");
  const requestId = useRef("");
  const active = useRef(false);
  const alive = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = providers.find(
    (item) => item.id === selectedId && item.profileId === profileId,
  );
  const visibleProviders = providers.filter(
    (item) => item.profileId === profileId,
  );

  useEffect(() => {
    const existing = providers.find((item) => item.id === selectedId);
    if (existing) setDraft({ ...existing });
    setPreviews([]);
    setContextConfirmed(false);
    setCloudConsent(false);
    void send({ type: "ai.context.revoke" });
  }, [selectedId]);
  useEffect(() => {
    for (const preview of previews)
      void send({ type: "ai.context.discard", ticket: preview.ticket });
    setPreviews([]);
    setContextConfirmed(false);
  }, [
    activeTab?.id,
    activeTab?.url,
    activeTab?.loading,
    browser.splitTabId,
    browser.splitPrimaryId,
  ]);
  useEffect(() => {
    if (!browser.splitTabId) setSourceChoice("active");
  }, [browser.splitTabId]);

  useEffect(() => {
    let mounted = true;
    alive.current = true;
    void send({ type: "ai.providers.list" }).then((result) => {
      if (!mounted || !result.ok) return;
      const items = result.data as AiProviderConfig[];
      if (Array.isArray(items)) setProviders(items);
    });
    return () => {
      mounted = false;
      alive.current = false;
      void send({ type: "ai.chat.cancel" });
      active.current = false;
    };
  }, []);

  useEffect(() => {
    setDraft(emptyConfig(profileId, "ollama"));
    setSelectedId("");
    setMessages([]);
    setCloudConsent(false);
    setModels([]);
    if (active.current) void send({ type: "ai.chat.cancel" });
    active.current = false;
    requestId.current = "";
    setRunning(false);
  }, [profileId]);

  useEffect(() => {
    const off = window.raincode.onAI((event: AiChatEvent) => {
      if (!active.current || event.requestId !== requestId.current) return;
      if (event.type === "delta" && event.text) {
        setMessages((items) => {
          const last = items.at(-1);
          if (!last || last.role !== "assistant") return items;
          return [
            ...items.slice(0, -1),
            { role: "assistant", content: last.content + event.text },
          ];
        });
      } else if (event.type === "done" || event.type === "error") {
        active.current = false;
        requestId.current = "";
        setRunning(false);
        if (event.type === "error") setNotice(event.error || t("error"));
      }
    });
    return off;
  }, [browser.settings.locale]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  async function refreshProviders(preferredId?: string) {
    if (!alive.current) return;
    const result = await send({ type: "ai.providers.list" });
    if (!alive.current || !result.ok || !Array.isArray(result.data)) return;
    const items = result.data as AiProviderConfig[];
    setProviders(items);
    if (preferredId) setSelectedId(preferredId);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await send({
        type: "ai.provider.set",
        config: { ...draft, profileId },
        ...(key ? { key } : {}),
      });
      if (!alive.current) return;
      if (result.ok) {
        setKey("");
        setPreviews([]);
        setContextConfirmed(false);
        await refreshProviders(draft.id);
        setNotice(t("connected"));
        setSection("chat");
      } else setNotice(result.error || t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (active.current) await stop();
      if (!alive.current) return;
      const result = await send({
        type: "ai.provider.remove",
        id: selected.id,
      });
      if (result.ok) {
        await refreshProviders();
        setSelectedId("");
        setDraft(emptyConfig(profileId, "ollama"));
        setMessages([]);
        setModels([]);
        setNotice(t("removed"));
      } else setNotice(result.error || t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function discover() {
    if (!selected || !isLocalAiProvider(selected) || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await send({ type: "ai.models.list", id: selected.id });
      if (!alive.current) return;
      if (!result.ok) {
        setNotice(result.error || t("failedModels"));
        return;
      }
      const names = Array.isArray(result.data)
        ? result.data.filter((item): item is string => typeof item === "string")
        : [];
      setModels(names);
      if (!names.length) setNotice(t("noModels"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    active.current = false;
    requestId.current = "";
    setRunning(false);
    setPreviews([]);
    setContextConfirmed(false);
    await send({ type: "ai.chat.cancel" });
  }
  async function collectContext() {
    if (!selected || busy || running) return;
    const ids =
      sourceChoice === "both"
        ? [browser.splitPrimaryId, browser.splitTabId]
        : [
            sourceChoice === "first"
              ? browser.splitPrimaryId
              : sourceChoice === "second"
                ? browser.splitTabId
                : activeTab?.id,
          ];
    setBusy(true);
    setNotice("");
    setContextConfirmed(false);
    setCloudConsent(false);
    for (const preview of previews)
      void send({ type: "ai.context.discard", ticket: preview.ticket });
    setPreviews([]);
    try {
      for (const tabId of [
        ...new Set(ids.filter((id): id is string => Boolean(id))),
      ]) {
        const result = await send({
          type: "ai.context.collect",
          id: selected.id,
          tabId,
          kind: contextKind,
        });
        if (!alive.current) {
          if (result.ok)
            void send({
              type: "ai.context.discard",
              ticket: (result.data as AiContextPreview).ticket,
            });
          break;
        }
        if (!result.ok) {
          setNotice(result.error || t("error"));
          break;
        }
        setPreviews((items) => [...items, result.data as AiContextPreview]);
      }
    } finally {
      setBusy(false);
    }
  }
  async function discardContext(ticket: string) {
    await send({ type: "ai.context.discard", ticket });
    setPreviews((items) => items.filter((item) => item.ticket !== ticket));
    setContextConfirmed(false);
  }
  async function testConnection() {
    if (!selected || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await send({ type: "ai.provider.test", id: selected.id });
      setNotice(
        result.ok && (result.data as { tested?: boolean })?.tested
          ? t("tested")
          : result.error || t("statusIdle"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    if (active.current) await stop();
    if (!alive.current) return;
    setMessages([]);
    setPrompt("");
    setCloudConsent(false);
    setNotice("");
    await send({ type: "ai.context.revoke" });
    setPreviews([]);
    setContextConfirmed(false);
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || active.current || busy) return;
    if (!selected) {
      setNotice(t("providerUnavailable"));
      setSection("connection");
      return;
    }
    if (profile?.mode !== "direct" || browser.settings.networkKillSwitch) {
      setNotice(t("unsupportedProfile"));
      return;
    }
    if (!isLocalAiProvider(selected) && !cloudConsent) {
      setNotice(t("promptCloud"));
      return;
    }
    if (
      previews.length &&
      (!contextConfirmed ||
        previews.some((preview) => preview.expiresAt <= Date.now()))
    ) {
      setNotice(t(contextConfirmed ? "contextExpired" : "contextReview"));
      return;
    }
    const history = messages.filter((item) => item.content).slice(-14);
    const input: AiChatMessage = { role: "user", content: text };
    const next = [...history, input];
    const id = crypto.randomUUID();
    requestId.current = id;
    active.current = true;
    setRunning(true);
    setNotice("");
    setPrompt("");
    setCloudConsent(false);
    setMessages((items) => [
      ...items.slice(-30),
      input,
      { role: "assistant", content: "" },
    ]);
    const result = await send({
      type: "ai.chat.start",
      id: selected.id,
      requestId: id,
      messages: next,
      cloudConsent: !isLocalAiProvider(selected),
      contextTickets: previews.map((preview) => preview.ticket),
      contextConfirmed,
    });
    if (result.ok) {
      setPreviews([]);
      setContextConfirmed(false);
    }
    if (!result.ok && requestId.current === id) {
      active.current = false;
      requestId.current = "";
      setRunning(false);
      setNotice(result.error || t("error"));
    }
  }

  return (
    <aside className="rain-ai-panel" aria-label={t("title")}>
      <header className="rain-ai-header">
        <span className="rain-ai-logo">
          <Bot size={19} aria-hidden="true" />
        </span>
        <div className="rain-ai-heading">
          <strong>{t("title")}</strong>
          <small>
            {running
              ? t("statusRunning")
              : selected
                ? t("statusConnected")
                : t("statusIdle")}
          </small>
        </div>
        <button
          className="rain-ai-icon"
          type="button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>

      <nav className="rain-ai-tabs" aria-label={t("title")}>
        {(
          [
            ["chat", MessageSquareText],
            ["connection", PlugZap],
            ["privacy", Shield],
          ] as const
        ).map(([tab, Icon]) => (
          <button
            key={tab}
            className={section === tab ? "active" : ""}
            type="button"
            aria-current={section === tab ? "page" : undefined}
            onClick={() => setSection(tab)}
          >
            <Icon size={15} aria-hidden="true" /> {t(tab)}
          </button>
        ))}
      </nav>

      {notice && (
        <p className="rain-ai-notice" role="status">
          {aiErrorText(browser.settings.locale, notice)}
        </p>
      )}

      {section === "chat" && (
        <div className="rain-ai-chat">
          <div className="rain-ai-chat-toolbar">
            <select
              aria-label={t("select")}
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setCloudConsent(false);
              }}
            >
              <option value="">{t("chooseModel")}</option>
              {visibleProviders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.model} · {item.kind}
                </option>
              ))}
            </select>
            <button
              className="button"
              type="button"
              onClick={() => void newChat()}
            >
              {t("newChat")}
            </button>
          </div>
          {!selected && (
            <div className="rain-ai-onboarding">
              <p>{t("noProvider")}</p>
              <button
                type="button"
                className="button"
                onClick={() => setSection("connection")}
              >
                {t("setupModel")}
              </button>
            </div>
          )}
          <details className="rain-ai-context-tools" open={previews.length > 0}>
            <summary>{t("pageContext")}</summary>
            <p className="hint">
              {t(previews.length ? "contextReview" : "contextHint")}
            </p>
            {!previews.length && (
              <>
                <label className="field">
                  {t("contextKind")}
                  <select
                    aria-label={t("contextKind")}
                    value={contextKind}
                    disabled={busy || running}
                    onChange={(event) =>
                      setContextKind(event.target.value as "page" | "css")
                    }
                  >
                    <option value="page">{t("textAndTags")}</option>
                    <option value="css">{t("cssLayout")}</option>
                  </select>
                </label>
                {contextKind === "css" && (
                  <p className="hint">{t("cssHint")}</p>
                )}
                <label className="field">
                  {t("source")}
                  <select
                    aria-label={t("source")}
                    value={sourceChoice}
                    onChange={(event) => setSourceChoice(event.target.value)}
                  >
                    <option value="active">{t("activePage")}</option>
                    {browser.splitTabId && (
                      <>
                        <option value="first">{t("firstPane")}</option>
                        <option value="second">{t("secondPane")}</option>
                        <option value="both">{t("bothPanes")}</option>
                      </>
                    )}
                  </select>
                </label>
                <button
                  className="button"
                  disabled={
                    busy ||
                    running ||
                    !selected ||
                    profile?.mode !== "direct" ||
                    activeTab?.loading ||
                    !/^https?:/.test(activeTab?.url || "")
                  }
                  onClick={() => void collectContext()}
                >
                  {t("collectContext")}
                </button>
              </>
            )}
            {previews.map((preview) => (
              <article key={preview.ticket}>
                <strong>{preview.origin}</strong>
                <p>{preview.title}</p>
                <textarea
                  aria-label={`${t("pageContext")}: ${preview.origin}`}
                  value={preview.preview}
                  readOnly
                  spellCheck={false}
                  rows={10}
                />
                <button
                  className="button"
                  onClick={() => void discardContext(preview.ticket)}
                >
                  {t("discardContext")}
                </button>
              </article>
            ))}
          </details>
          <div
            className="rain-ai-messages"
            ref={scroller}
            role="log"
            aria-live="polite"
          >
            {!messages.length && <p className="rain-ai-empty">{t("empty")}</p>}
            {messages.map((item, index) => (
              <div className={`rain-ai-message ${item.role}`} key={index}>
                <small>
                  {item.role === "user" ? t("message") : t("title")}
                </small>
                <p>
                  {item.content ||
                    (running && index === messages.length - 1 ? "…" : "")}
                </p>
              </div>
            ))}
          </div>
          <div className="rain-ai-compose">
            {previews.length > 0 && (
              <label className="rain-ai-check">
                <input
                  type="checkbox"
                  checked={contextConfirmed}
                  onChange={(event) =>
                    setContextConfirmed(event.target.checked)
                  }
                />
                {t("contextConfirm")}
              </label>
            )}
            {!isLocalAiProvider(selected) && selected && (
              <label className="rain-ai-check">
                <input
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(event) => setCloudConsent(event.target.checked)}
                />
                {t("allowCloud")}
              </label>
            )}
            <label htmlFor="rain-ai-prompt">{t("message")}</label>
            <textarea
              id="rain-ai-prompt"
              value={prompt}
              maxLength={16000}
              placeholder={t("messagePlaceholder")}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="rain-ai-actions">
              {running ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void stop()}
                >
                  {t("stop")}
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || !prompt.trim() || !selected}
                  onClick={() => void submit()}
                >
                  {t("send")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {section === "connection" && (
        <div className="rain-ai-settings">
          <p className="hint">{t("keyHint")}</p>
          <label className="field">
            {t("select")}
            <select
              value={selectedId}
              onChange={(event) => {
                const existing = providers.find(
                  (item) => item.id === event.target.value,
                );
                setSelectedId(event.target.value);
                setDraft(existing || emptyConfig(profileId, "ollama"));
                setKey("");
                setModels([]);
              }}
            >
              <option value="">{t("newConnection")}</option>
              {visibleProviders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.model} · {item.kind}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("provider")}
            <select
              value={draft.kind}
              aria-label={t("provider")}
              onChange={(event) => {
                setDraft(emptyConfig(profileId, event.target.value as Kind));
                setSelectedId("");
                setKey("");
                setModels([]);
              }}
            >
              <option value="ollama">Ollama</option>
              <option value="local-openai">
                LM Studio / llama.cpp (local)
              </option>
              <option value="openai-compatible">OpenAI-compatible HTTPS</option>
            </select>
          </label>
          <label className="field">
            {t("endpoint")}
            <input
              value={draft.endpoint}
              onChange={(event) =>
                setDraft({ ...draft, endpoint: event.target.value })
              }
              placeholder={
                draft.kind === "ollama"
                  ? "http://127.0.0.1:11434"
                  : "https://api.example.com/v1"
              }
              spellCheck={false}
            />
          </label>
          <label className="field">
            {t("model")}
            <input
              value={draft.model}
              onChange={(event) =>
                setDraft({ ...draft, model: event.target.value })
              }
              spellCheck={false}
            />
          </label>
          {models.length > 0 && (
            <label className="field">
              {t("discovered")}
              <select
                value=""
                onChange={(event) =>
                  setDraft({ ...draft, model: event.target.value })
                }
              >
                <option value="">{t("manual")}</option>
                {models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.kind !== "ollama" && (
            <label className="field">
              {t("key")}
              <input
                type="password"
                autoComplete="off"
                value={key}
                placeholder={t("keyPlaceholder")}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
          )}
          <p className="hint">{t("visionHint")}</p>
          <p className="hint">
            {draft.kind === "local-openai"
              ? browser.settings.locale === "ru"
                ? "OpenAI-совместимый сервер на этом компьютере: LM Studio или llama.cpp. Ключ необязателен. Rain не отправляет контекст в облако; проверьте, что сам сервер не использует внешние сервисы."
                : "OpenAI-compatible server on this computer: LM Studio or llama.cpp. Key is optional. Rain does not upload context to cloud providers; check that the server itself does not use external services."
              : draft.kind === "ollama"
                ? t("localHint")
                : t("cloudHint")}
          </p>
          <div className="rain-ai-actions">
            <button
              className="button"
              type="button"
              disabled={busy || !selected}
              onClick={() => void testConnection()}
            >
              {t("test")}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy || !draft.model.trim() || !draft.endpoint.trim()}
              onClick={() => void save()}
            >
              {t("save")}
            </button>
            {isLocalAiProvider(selected) && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void discover()}
              >
                {selected?.kind === "local-openai"
                  ? browser.settings.locale === "ru"
                    ? "Получить модели локального сервера"
                    : "List local server models"
                  : t("discover")}
              </button>
            )}
            {selected && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {t("remove")}
              </button>
            )}
          </div>
        </div>
      )}

      {section === "privacy" && (
        <div className="rain-ai-settings">
          <h3>{t("privacy")}</h3>
          <button
            className="button"
            onClick={() =>
              void send({ type: "navigate", url: "raincode://privacy#ai" })
            }
          >
            {t("openPrivacyCenter")}
          </button>
        </div>
      )}
    </aside>
  );
}
