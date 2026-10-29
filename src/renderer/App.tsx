import { PasswordVault } from "./PasswordVault";
import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Plus,
  Search,
  House,
  ShieldCheck,
  Shield,
  Star,
  Code2,
  History,
  Download,
  Bookmark,
  Layers,
  Settings2,
  Menu,
  Minus,
  Square,
  CloudRain,
  Command as CommandIcon,
  ArrowUpRight,
  ChevronRight,
  Globe,
  Terminal,
  LockKeyhole,
  VolumeX,
  Pin,
  Network,
  Folder,
  FileCode,
  SlidersHorizontal,
  Columns2,
  Check,
  Bot,
} from "lucide-react";
import type { BrowserState, Command, Settings, Tab } from "../shared/contracts";
import { translate, type MessageKey } from "./i18n";
import { send, useBrowser } from "./store";
import { RainCanvas } from "./RainCanvas";
import { ThemeScene } from "./ThemeScene";
import { AppearanceStudio } from "./AppearanceStudio";
import "./theme-scene.css";
import { Omnibox } from "./Omnibox";
import { effectCommand } from "./omniboxHelpers";
import { DeveloperWorkspace } from "./DeveloperWorkspace";
import { BrowserNotice } from "./BrowserNotice";
import { SiteDiagnosticsPanel } from "./SiteDiagnostics";
import { TrackerPanel } from "./TrackerPanel";
import { TorStatus } from "./TorStatus";
import { torText } from "./tor-i18n";
import { SecurityPrivacyDashboard } from "./PrivacyDashboard";
import { SecurityCenter } from "./SecurityCenter";
import { PrivacyControls } from "./PrivacyControls";
import { PrivacyHub, privacyHubText } from "./PrivacyHub";
import { PrivacyProof } from "./PrivacyProof";
import { DnsControls } from "./DnsControls";
import { SplitPanes } from "./SplitPanes";
import { splitText } from "./split-i18n";
import { dashboardText } from "./privacy-dashboard-i18n";
import { ProxyCredentials } from "./ProxyCredentials";
import { ProxyRoute } from "./ProxyRoute";
import { AiPrivacySettings } from "./AiPrivacySettings";
import { PrivacyMonitorPanel } from "./PrivacyMonitor";
import { privacySections } from "../shared/contracts";
import { developerText } from "./developer-i18n";

type T = (key: MessageKey) => string;
const AiPanel = lazy(() =>
  import("./AiPanel").then((module) => ({ default: module.AiPanel })),
);
const iconSize = 17;
function IconButton({
  label,
  children,
  onClick,
  disabled,
  active,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "selected" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Button({
  children,
  onClick,
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <CloudRain size={32} />
      <p>{children}</p>
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="card section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
const internal = (tab?: Tab) => !tab || tab.url.startsWith("raincode://");
const run = (command: Command) => {
  void send(command);
};

export function App() {
  const [tabQuery, setTabQuery] = useState("");
  const { browser, setBrowser, toast, setToast } = useBrowser();
  const [failed, setFailed] = useState(false);
  const [effectsFocused, setEffectsFocused] = useState(
    () => !document.hidden && document.hasFocus(),
  );
  const [focusRequest, setFocusRequest] = useState({
    serial: 0,
    search: false,
  });
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [vaultRequested, setVaultRequested] = useState(false);
  useEffect(() => {
    const open = () => setAiOpen(true);
    window.addEventListener("raincode-open-ai", open);
    return () => window.removeEventListener("raincode-open-ai", open);
  }, []);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const [find, setFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [dragTab, setDragTab] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const t: T = (key) => translate(browser?.settings.locale || "ru", key);
  const tab = browser?.tabs.find((item) => item.id === browser.activeTabId);
  const profile = browser?.profiles.find((item) => item.id === tab?.profileId);
  const navigationError = useBrowser((s) => s.navigationError);
  const setNavigationError = useBrowser((s) => s.setNavigationError);
  const overlay =
    palette ||
    menu ||
    tabMenu !== null ||
    suggestionsOpen ||
    navigationError !== null;
  const effectsActive =
    (browser?.windowFocused ?? effectsFocused) &&
    (internal(tab) || overlay || Boolean(tab?.error));
  const openPage = (page: string) =>
    run(
      page === "devpanel"
        ? { type: "tab.create", url: "raincode://devpanel" }
        : {
            type: "navigate",
            url: `raincode://${["security", "network", "tor"].includes(page) ? `privacy#${page}` : page}`,
          },
    );
  useEffect(() => {
    if (!vaultRequested || tab?.url !== "raincode://privacy#sites") return;
    const vault = document.getElementById("rain-password-vault");
    if (!vault) return;
    const section = vault.closest("details");
    if (section) section.open = true;
    vault.scrollIntoView({ block: "start", behavior: "instant" });
    vault.focus({ preventScroll: true });
    setVaultRequested(false);
  }, [vaultRequested, tab?.id, tab?.url]);
  useEffect(() => {
    const updateFocus = () =>
      setEffectsFocused(!document.hidden && document.hasFocus());
    const blur = () => setEffectsFocused(false);
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", updateFocus);
    updateFocus();
    return () => {
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", updateFocus);
    };
  }, []);
  useEffect(() => {
    if (!window.raincode) {
      setFailed(true);
      return;
    }
    void window.raincode
      .getState()
      .then(setBrowser)
      .catch(() => setFailed(true));
    const offState = window.raincode.onState(setBrowser);
    const offKeys = window.raincode.onShortcut((action) => {
      if (action === "address" || action === "search")
        setFocusRequest((value) => ({
          serial: value.serial + 1,
          search: action === "search",
        }));
      if (action === "palette") setPalette((value) => !value);
      if (action === "find") setFind((value) => !value);
      if (action === "ai") setAiOpen((value) => !value);
    });
    return () => {
      offState();
      offKeys();
    };
  }, [setBrowser]);
  useEffect(() => {
    setMenu(false);
    setTabMenu(null);
    setFind(false);
  }, [tab?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast, setToast]);
  useEffect(() => {
    const target = pageRef.current;
    if (!target || !browser) return;
    const update = () => {
      const rect = target.getBoundingClientRect();
      const findHeight = find ? (48 * browser.settings.fontSize) / 14 : 0;
      run({
        type: "layout",
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y + findHeight),
          width: Math.round(rect.width),
          height: Math.round(Math.max(0, rect.height - findHeight)),
        },
        overlay,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(target);
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    browser?.settings.verticalTabs,
    browser?.settings.fontSize,
    browser?.activeTabId,
    browser?.splitTabId,
    overlay,
    find,
    !!browser,
  ]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !event.isComposing
      ) {
        const editing =
          event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
          );
        if (!palette && !menu && tabMenu === null && !find && !editing) {
          const current = useBrowser.getState().browser;
          if (
            current?.tabs.find((tab) => tab.id === current.activeTabId)?.loading
          )
            run({ type: "action", action: "stop" });
        }
        setPalette(false);
        setMenu(false);
        setTabMenu(null);
        setFind(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [palette, menu, tabMenu, find]);
  if (!browser)
    return (
      <div className="boot">
        <CloudRain size={48} />
        <h1>RainCode</h1>
        <p>{failed ? t("noBridge") : t("loading")}</p>
      </div>
    );
  const settings = browser.settings;
  const commands: { key: MessageKey; command?: Command; page?: string }[] = [
    { key: "newTab", command: { type: "tab.create" } },
    { key: "restore", command: { type: "tab.restore" } },
    { key: "history", page: "history" },
    { key: "recentlyClosed", page: "recently-closed" },
    { key: "bookmarks", page: "bookmarks" },
    { key: "downloads", page: "downloads" },
    { key: "settings", page: "settings" },
    { key: "workspaces", page: "workspaces" },
    { key: "network", page: "network" },
    { key: "devtools", command: { type: "action", action: "devtools" } },
    { key: "system", page: "system" },
  ];
  const sidebar: { key: MessageKey; icon: ReactNode; page: string }[] = [
    { key: "home", icon: <House size={iconSize} />, page: "newtab" },
    { key: "history", icon: <History size={iconSize} />, page: "history" },
    {
      key: "recentlyClosed",
      icon: <RotateCw size={iconSize} />,
      page: "recently-closed",
    },
    { key: "bookmarks", icon: <Bookmark size={iconSize} />, page: "bookmarks" },
    { key: "downloads", icon: <Download size={iconSize} />, page: "downloads" },
    { key: "workspaces", icon: <Layers size={iconSize} />, page: "workspaces" },
    { key: "devpanel", icon: <Code2 size={iconSize} />, page: "devpanel" },
    { key: "network", icon: <Network size={iconSize} />, page: "network" },
  ];
  const tabStrip = (
    <div className="tab-list" role="tablist">
      {browser.tabs
        .filter(
          (item) =>
            !settings.verticalTabs ||
            !tabQuery ||
            `${item.title} ${item.url} ${item.group || ""}`
              .toLowerCase()
              .includes(tabQuery.toLowerCase()),
        )
        .map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragTab(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const ids = browser.tabs
                .map((t) => t.id)
                .filter((id) => id !== dragTab);
              ids.splice(ids.indexOf(item.id), 0, dragTab);
              if (dragTab) run({ type: "tab.reorder", ids });
            }}
            className={`tab mode-${browser.profiles.find((profile) => profile.id === item.profileId)?.mode || "direct"} ${item.id === tab?.id ? "active" : ""} ${item.pinned ? "pinned" : ""} ${item.group ? "grouped" : ""}`}
            onContextMenu={(event) => {
              event.preventDefault();
              setTabMenu(item.id);
            }}
          >
            <button
              role="tab"
              aria-label={item.title || item.url}
              aria-selected={item.id === tab?.id}
              onClick={() => run({ type: "tab.activate", id: item.id })}
              title={`${item.title}\n${item.url}`}
              className="tab-select"
            >
              {item.loading ? (
                <span className="spinner" />
              ) : item.favicon && /^data:image\//.test(item.favicon) ? (
                <img src={item.favicon} alt="" referrerPolicy="no-referrer" />
              ) : internal(item) ? (
                <CloudRain size={14} />
              ) : (
                <Globe size={14} />
              )}
              <span>{item.title || t("newTab")}</span>
              {item.group && <small>{item.group}</small>}
              {item.pinned && <Pin size={11} />}
              {item.muted && <VolumeX size={12} />}
            </button>
            <button
              aria-label={t("closeTab")}
              className="tab-close"
              onClick={() => run({ type: "tab.close", id: item.id })}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      <IconButton
        label={t("newTab")}
        onClick={() => run({ type: "tab.create" })}
      >
        <Plus size={17} />
      </IconButton>
    </div>
  );
  const currentPage =
    tab?.url.replace("raincode://", "").split(/[/?#]/)[0] || "newtab";
  const bookmarked = browser.bookmarks.some((item) => item.url === tab?.url);
  return (
    <div
      className={`app ${settings.customColors ? "custom-colors" : ""} theme-${settings.theme} scene-bg-${settings.scene} performance-${settings.performanceMode} ${!settings.graphicsEnabled ? "effects-disabled" : ""} motion-${settings.motionPreference} ${settings.powerSave ? "power-save" : ""} ${settings.highContrast || settings.theme === "contrast" ? "high-contrast" : ""} ${!settings.blur ? "no-blur" : ""} ${!settings.transparency ? "opaque" : ""} ${settings.verticalTabs ? "vertical" : ""} ${!settings.bokeh ? "no-bokeh" : ""} ${!settings.glow ? "no-glow" : ""} ${!settings.cinematic ? "no-cinematic" : ""} ${!settings.parallax || settings.powerSave ? "no-parallax" : ""} ${!effectsActive ? "effects-paused" : ""}`}
      data-effects-active={effectsActive}
      style={
        {
          fontSize: settings.fontSize,
          "--ui-scale": settings.fontSize / 14,
          "--scene-brightness": settings.brightness,
          "--shell-color": settings.shellColor,
          "--chosen-accent": settings.accentColor,
        } as React.CSSProperties
      }
    >
      <ThemeScene theme={settings.scene} artwork={settings.sceneArtwork} />
      <div className="atmosphere-bokeh" aria-hidden="true" />
      <div className="scene-shade" />
      <RainCanvas settings={settings} active={effectsActive} />
      <header className="titlebar">
        <div className="brand">
          <CloudRain size={19} />
          <span>RainCode</span>
        </div>
        {!settings.verticalTabs && tabStrip}
        <div className="titlebar-spacer" />
        <div className="window-controls">
          <IconButton label={t("searchTabs")} onClick={() => setPalette(true)}>
            <Search size={15} />
          </IconButton>
          <IconButton
            label={t("minimize")}
            onClick={() => run({ type: "action", action: "minimize" })}
          >
            <Minus size={15} />
          </IconButton>
          <IconButton
            label={t("maximize")}
            onClick={() => run({ type: "action", action: "maximize" })}
          >
            <Square size={12} />
          </IconButton>
          <IconButton
            label={t("close")}
            className="close-window"
            onClick={() => run({ type: "action", action: "close" })}
          >
            <X size={17} />
          </IconButton>
        </div>
      </header>
      <div className="toolbar">
        <div className="navigation">
          <IconButton
            label={t("back")}
            disabled={!tab?.canGoBack}
            onClick={() => run({ type: "action", action: "back" })}
          >
            <ArrowLeft size={18} />
          </IconButton>
          <IconButton
            label={t("forward")}
            disabled={!tab?.canGoForward}
            onClick={() => run({ type: "action", action: "forward" })}
          >
            <ArrowRight size={18} />
          </IconButton>
          <IconButton
            label={t(tab?.loading ? "stop" : "reload")}
            onClick={() =>
              run({ type: "action", action: tab?.loading ? "stop" : "reload" })
            }
          >
            {tab?.loading ? <X size={17} /> : <RotateCw size={16} />}
          </IconButton>
          <IconButton label={t("home")} onClick={() => openPage("newtab")}>
            <House size={17} />
          </IconButton>
        </div>
        <Omnibox
          inputRef={addressRef}
          url={tab?.url || "raincode://newtab"}
          tabId={tab?.id || ""}
          label={t("address")}
          suggestionLabel={t("localSuggestions")}
          history={browser.history}
          bookmarks={browser.bookmarks}
          focusRequest={focusRequest}
          onSuggestions={setSuggestionsOpen}
          onNavigate={(value, newTab) => {
            const effect = effectCommand(value);
            if (effect) {
              const partial: Partial<Settings> =
                effect === "rain"
                  ? { rain: settings.rain === "off" ? "medium" : "off" }
                  : effect === "glass"
                    ? {
                        transparency: !settings.transparency,
                        blur: !settings.transparency,
                      }
                    : { [effect]: !settings[effect] };
              run({ type: "settings.update", settings: partial });
              return false;
            }
            run(
              newTab
                ? { type: "tab.create", url: value }
                : { type: "navigate", url: value },
            );
          }}
          leading={
            <span
              title={t(
                internal(tab)
                  ? "internal"
                  : tab?.url.startsWith("https:")
                    ? "encrypted"
                    : "insecure",
              )}
              className="address-lock"
            >
              {internal(tab) ? (
                <Search size={15} />
              ) : tab?.url.startsWith("https:") ? (
                <LockKeyhole size={14} />
              ) : (
                <Globe size={15} />
              )}
            </span>
          }
          trailing={
            <IconButton
              label={t(bookmarked ? "removeBookmark" : "addBookmark")}
              disabled={internal(tab)}
              active={bookmarked}
              onClick={() => run({ type: "bookmark.toggle" })}
            >
              <Star size={16} fill={bookmarked ? "currentColor" : "none"} />
            </IconButton>
          }
        />
        {browser.privacyMonitorTabId && (
          <button
            className="button"
            onClick={() => run({ type: "privacy.monitor.stop" })}
          >
            {settings.locale === "ru"
              ? "Монитор сети: остановить"
              : "Network monitor: stop"}
          </button>
        )}
        <button
          className={`connection-chip mode-${profile?.mode} tor-status-${browser.tor?.status || "stopped"}`}
          onClick={() => openPage(profile?.mode === "tor" ? "tor" : "network")}
          title={
            profile?.mode === "tor" && browser.tor
              ? torText(settings.locale, browser.tor.status)
              : t("network")
          }
        >
          <span className="status-dot" />
          {settings.networkKillSwitch
            ? dashboardText(settings.locale, "killOn")
            : t(profile?.mode || "direct")}
        </button>
        <IconButton
          label={t(browser.splitTabId ? "stopSplit" : "split")}
          onClick={() =>
            run({
              type: "split",
              id: browser.splitTabId
                ? undefined
                : browser.tabs.find(
                    (item) => item.id !== tab?.id && !internal(item),
                  )?.id,
            })
          }
          disabled={
            !browser.splitTabId &&
            (internal(tab) ||
              !browser.tabs.some(
                (item) => item.id !== tab?.id && !internal(item),
              ))
          }
        >
          <Columns2 size={17} />
        </IconButton>
        <IconButton
          label={t("devtools")}
          onClick={() => run({ type: "action", action: "devtools" })}
          disabled={internal(tab)}
        >
          <Code2 size={19} />
        </IconButton>
        <IconButton
          label={t("menu")}
          active={menu}
          onClick={() => setMenu(!menu)}
        >
          <Menu size={21} />
        </IconButton>
      </div>
      <div className="body">
        <aside className="sidebar">
          <div className="side-top">
            <button
              className={`sidebar-ai ${aiOpen ? "selected" : ""}`}
              aria-label={t("aiPanel")}
              title={t("aiPanel")}
              aria-pressed={aiOpen}
              onClick={() => setAiOpen(!aiOpen)}
            >
              <Bot size={19} />
              <span>{t("ai")}</span>
            </button>
            {sidebar.map((item, index) => (
              <div
                key={item.key}
                className={index === 4 ? "sidebar-break" : ""}
              >
                <IconButton
                  label={t(item.key)}
                  active={internal(tab) && currentPage === item.page}
                  onClick={() => openPage(item.page)}
                >
                  {item.icon}
                </IconButton>
              </div>
            ))}
          </div>
          <div className="side-bottom">
            <IconButton
              label={
                browser.settings.locale === "ru"
                  ? "Менеджер паролей"
                  : "Password manager"
              }
              active={tab?.url === "raincode://privacy#sites"}
              onClick={() => {
                setVaultRequested(true);
                openPage("privacy#sites");
              }}
            >
              <LockKeyhole size={18} />
            </IconButton>
            <IconButton
              label={t("commandPalette")}
              onClick={() => setPalette(true)}
            >
              <CommandIcon size={18} />
            </IconButton>
            <IconButton
              label={t("privacy")}
              active={["privacy", "security", "network", "tor"].includes(
                currentPage,
              )}
              onClick={() => openPage("privacy")}
            >
              <Shield size={18} />
            </IconButton>
            <IconButton
              label={t("settings")}
              active={currentPage === "settings"}
              onClick={() => openPage("settings")}
            >
              <Settings2 size={18} />
            </IconButton>
            <button
              className="profile-avatar"
              title={t("profiles")}
              aria-label={t("profiles")}
              onClick={() => openPage("network")}
            >
              {profile?.name.slice(0, 1) || "R"}
            </button>
          </div>
        </aside>
        {settings.verticalTabs && (
          <aside
            className={`vertical-strip ${settings.verticalTabsCollapsed ? "collapsed" : ""}`}
          >
            <IconButton
              label={splitText(
                settings.locale,
                settings.verticalTabsCollapsed ? "expandTabs" : "collapseTabs",
              )}
              onClick={() => {
                setTabQuery("");
                run({
                  type: "settings.update",
                  settings: {
                    verticalTabsCollapsed: !settings.verticalTabsCollapsed,
                  },
                });
              }}
            >
              {settings.verticalTabsCollapsed ? "→" : "←"}
            </IconButton>
            {!settings.verticalTabsCollapsed && (
              <input
                className="vertical-tab-search"
                aria-label={splitText(settings.locale, "searchTabs")}
                placeholder={splitText(settings.locale, "searchTabs")}
                value={tabQuery}
                onChange={(event) => setTabQuery(event.target.value)}
              />
            )}
            {tabStrip}
          </aside>
        )}
        <main
          ref={pageRef}
          className={`page ${internal(tab) ? "internal" : "web"}`}
        >
          {browser.splitTabId && browser.splitPrimaryId && (
            <SplitPanes
              browser={browser}
              topOffset={find ? (48 * settings.fontSize) / 14 : 0}
            />
          )}
          {find && (
            <form
              className="find-bar"
              onSubmit={(event) => {
                event.preventDefault();
                run({ type: "find", text: findText });
              }}
            >
              <Search size={15} />
              <input
                autoFocus
                aria-label={t("find")}
                placeholder={t("find")}
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value);
                  run({ type: "find", text: e.target.value });
                }}
              />
              <IconButton
                label={t("back")}
                onClick={() =>
                  run({ type: "find", text: findText, forward: false })
                }
              >
                <ArrowLeft size={14} />
              </IconButton>
              <IconButton label={t("close")} onClick={() => setFind(false)}>
                <X size={14} />
              </IconButton>
            </form>
          )}
          {internal(tab) && (
            <InternalPage
              page={currentPage}
              browser={browser}
              t={t}
              openPage={openPage}
              onPalette={() => setPalette(true)}
            />
          )}
          {!browser.splitTabId && !internal(tab) && tab?.error && (
            <BrowserNotice
              title={t(
                tab.notice === "not-found"
                  ? "notFoundTitle"
                  : tab.notice === "empty-search"
                    ? "emptySearchTitle"
                    : "connectionFailedTitle",
              )}
              detail={tab.error}
            >
              <Button onClick={() => run({ type: "action", action: "reload" })}>
                {t("reconnect")}
              </Button>
              {tab.notice && (
                <Button onClick={() => run({ type: "page.original" })}>
                  {t("showOriginal")}
                </Button>
              )}
              <Button onClick={() => run({ type: "action", action: "home" })}>
                {t("newTab")}
              </Button>
            </BrowserNotice>
          )}
        </main>
        {aiOpen && (
          <Suspense
            fallback={<aside className="rain-ai-panel" aria-busy="true" />}
          >
            <AiPanel browser={browser} onClose={() => setAiOpen(false)} />
          </Suspense>
        )}
      </div>
      <footer className="statusbar">
        <span>
          <ShieldCheck size={12} />
          {t("localOnly")}
        </span>
        <span className="status-right">
          <span className="status-dot" />
          {t("noTelemetry")}
          <span className="status-divider" />
          {t(settings.scene)}
          <CloudRain size={12} />
        </span>
      </footer>
      {toast && (
        <div role="status" className="toast">
          <Shield size={17} />
          <span>{toast}</span>
          <IconButton label={t("close")} onClick={() => setToast("")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      {navigationError && (
        <BrowserNotice
          modal
          title={t("addressIssueTitle")}
          detail={navigationError}
          close={() => setNavigationError(null)}
          closeLabel={t("close")}
        />
      )}
      {menu && (
        <div className="overlay-backdrop" onClick={() => setMenu(false)}>
          <div
            className="browser-menu card"
            onClick={(event) => event.stopPropagation()}
          >
            {(
              [
                "find",
                "print",
                "savePage",
                "source",
                "fullscreen",
                "zoomIn",
                "zoomOut",
                "zoomReset",
                "restore",
              ] as const
            ).map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "find") setFind(true);
                  else if (key === "restore") run({ type: "tab.restore" });
                  else
                    run({
                      type: "action",
                      action: key === "savePage" ? "save" : key,
                    });
                  setMenu(false);
                }}
              >
                {t(key)}
              </button>
            ))}
            <hr />
            {(
              [
                "privacy",
                "security",
                "extensions",
                "system",
                "tor",
                "licenses",
                "about",
              ] as const
            ).map((page) => (
              <button
                key={page}
                onClick={() => {
                  openPage(page);
                  setMenu(false);
                }}
              >
                {t(page)}
              </button>
            ))}
          </div>
        </div>
      )}
      {tabMenu && (
        <div className="overlay-backdrop" onClick={() => setTabMenu(null)}>
          <div
            className="tab-menu card"
            onClick={(event) => event.stopPropagation()}
          >
            {(
              [
                "duplicate",
                "pin",
                "mute",
                "suspend",
                "keepAwake",
                "split",
                "closeTab",
              ] as const
            ).map((key) => (
              <button
                key={key}
                disabled={
                  key === "split" &&
                  (tabMenu === browser.activeTabId ||
                    internal(
                      browser.tabs.find((item) => item.id === tabMenu),
                    ) ||
                    internal(tab))
                }
                onClick={() => {
                  const target = browser.tabs.find(
                    (item) => item.id === tabMenu,
                  );
                  if (key === "duplicate")
                    run({ type: "tab.duplicate", id: tabMenu });
                  if (key === "pin")
                    run({
                      type: "tab.update",
                      id: tabMenu,
                      pinned: !target?.pinned,
                    });
                  if (key === "mute")
                    run({
                      type: "tab.update",
                      id: tabMenu,
                      muted: !target?.muted,
                    });
                  if (key === "suspend")
                    run({ type: "tab.suspend", id: tabMenu });
                  if (key === "keepAwake")
                    run({
                      type: "tab.update",
                      id: tabMenu,
                      keepAwake: !target?.keepAwake,
                    });
                  if (key === "split") run({ type: "split", id: tabMenu });
                  if (key === "closeTab")
                    run({ type: "tab.close", id: tabMenu });
                  setTabMenu(null);
                }}
              >
                {t(key)}
                {key === "keepAwake" &&
                browser.tabs.find((tab) => tab.id === tabMenu)?.keepAwake
                  ? " ✓"
                  : ""}
              </button>
            ))}
            <label>
              {t("group")}
              <input
                placeholder={t("groupPlaceholder")}
                defaultValue={
                  browser.tabs.find((item) => item.id === tabMenu)?.group || ""
                }
                maxLength={32}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    run({
                      type: "tab.update",
                      id: tabMenu,
                      group: event.currentTarget.value,
                    });
                    setTabMenu(null);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}
      {palette && (
        <div className="modal-backdrop" onClick={() => setPalette(false)}>
          <div
            className="command-palette card"
            role="dialog"
            aria-modal="true"
            aria-label={t("commandPalette")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="palette-input">
              <Search size={21} />
              <input
                autoFocus
                aria-label={t("searchTabs")}
                placeholder={t("searchTabs")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <IconButton
                label={t("closePalette")}
                onClick={() => setPalette(false)}
              >
                <X size={16} />
              </IconButton>
            </div>
            <div className="palette-results">
              {browser.tabs
                .filter((item) =>
                  `${item.title} ${item.url}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      run({ type: "tab.activate", id: item.id });
                      setPalette(false);
                    }}
                  >
                    <Globe size={16} />
                    <span>
                      {item.title}
                      <small>{item.url}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              {commands
                .filter((item) =>
                  t(item.key).toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (item.command) run(item.command);
                      if (item.page) openPage(item.page);
                      setPalette(false);
                    }}
                  >
                    <CommandIcon size={16} />
                    <span>{t(item.key)}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InternalPage({
  page,
  browser,
  t,
  openPage,
  onPalette,
}: {
  page: string;
  browser: BrowserState;
  t: T;
  openPage: (page: string) => void;
  onPalette: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (page !== "newtab" || !browser.settings.widgets) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      setNow(new Date());
      // The clock displays minutes. Avoid re-rendering every internal page each second.
      timer = setTimeout(update, 60_000 - (Date.now() % 60_000) + 20);
    };
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [page, browser.settings.widgets]);
  const settings = browser.settings;
  const tab = browser.tabs.find((item) => item.id === browser.activeTabId);
  const profile = browser.profiles.find((item) => item.id === tab?.profileId);
  const match = (item: { title: string; url: string }) =>
    `${item.title} ${item.url}`.toLowerCase().includes(filter.toLowerCase());
  if (page === "newtab")
    return (
      <div
        className="home-page"
        onPointerMove={(event) => {
          if (
            !settings.parallax ||
            !settings.cinematic ||
            settings.powerSave ||
            !settings.graphicsEnabled ||
            settings.performanceMode === "eco" ||
            settings.motionPreference === "reduced" ||
            (settings.motionPreference === "system" &&
              matchMedia("(prefers-reduced-motion: reduce)").matches)
          )
            return;
          const target = event.currentTarget.closest<HTMLElement>(".app");
          if (!target) return;
          target.style.setProperty(
            "--pointer-x",
            `${(event.clientX / innerWidth - 0.5) * 5}px`,
          );
          target.style.setProperty(
            "--pointer-y",
            `${(event.clientY / innerHeight - 0.5) * 4}px`,
          );
        }}
      >
        <div className="home-top">
          <div className="home-label">
            <span className="status-dot" />
            {t("hello")}
          </div>
          {settings.widgets && (
            <div className="clock">
              <strong>
                {now.toLocaleTimeString(settings.locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              <span>
                {now.toLocaleDateString(settings.locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
          )}
        </div>
        <div className="home-content">
          <div className="eyebrow">
            <span className="fine-line" />
            {t(settings.scene)}
          </div>
          <h1>
            {t("headline1")}
            <br />
            <span>{t("headline2")}</span>
          </h1>
          <p className="home-subtitle">{t("homeSubtitle")}</p>
          <form
            className="home-search"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run({ type: "navigate", url: String(data.get("search")) });
            }}
          >
            <Search size={20} />
            <input
              name="search"
              aria-label={t("search")}
              placeholder={t("search")}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229)
                )
                  event.preventDefault();
              }}
            />
            <button aria-label={t("search")}>
              <ArrowRight size={19} />
            </button>
            <kbd>↵</kbd>
          </form>
          {settings.widgets && (
            <>
              <div className="quick-label">{t("quickLinks")}</div>
              <div className="quick-links">
                {[
                  {
                    key: "github" as const,
                    url: "https://github.com",
                    icon: <Code2 size={20} />,
                    letter: "GH",
                  },
                  {
                    key: "mdn" as const,
                    url: "https://developer.mozilla.org",
                    icon: <FileCode size={20} />,
                    letter: "M",
                  },
                  {
                    key: "stackoverflow" as const,
                    url: "https://stackoverflow.com",
                    icon: <Layers size={20} />,
                    letter: "SO",
                  },
                  {
                    key: "localhost" as const,
                    url: "http://localhost:3000",
                    icon: <Terminal size={20} />,
                    letter: ">_",
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => run({ type: "navigate", url: item.url })}
                  >
                    <span className="quick-icon">{item.icon}</span>
                    <span>{t(item.key)}</span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
              <div className="workspace-promo">
                <div className="workspace-icon">
                  <Layers size={23} />
                </div>
                <div>
                  <span className="micro-label">{t("develop")}</span>
                  <h2>{t("workspaceTitle")}</h2>
                  <p>{t("workspaceSubtitle")}</p>
                </div>
                <button
                  className="workspace-open"
                  onClick={() => openPage("workspaces")}
                  aria-label={t("openWorkspace")}
                >
                  <ArrowUpRight size={21} />
                </button>
              </div>
              <div className="home-bottom-links">
                <button onClick={onPalette}>
                  <CommandIcon size={14} />
                  {t("commandPalette")}
                  <kbd>Ctrl Shift P</kbd>
                </button>
                <button onClick={() => openPage("settings")}>
                  <SlidersHorizontal size={14} />
                  {t("preferences")}
                </button>
              </div>
              {browser.recentlyClosed.length > 0 && (
                <div className="recent-home">
                  <button onClick={() => openPage("recently-closed")}>
                    <History size={14} />
                    {t("recentlyClosed")}
                    <span>
                      {
                        [...browser.recentlyClosed].sort(
                          (a, b) => (b.closedAt || 0) - (a.closedAt || 0),
                        )[0]?.title
                      }
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="home-caption">
          <div>
            <CloudRain size={16} />
            <span>{t("sceneCaption")}</span>
          </div>
          <span className="home-privacy">
            <ShieldCheck size={13} />
            {t(profile?.mode || "direct")} · {t("noTelemetry")}
          </span>
        </div>
      </div>
    );
  return (
    <div className="internal-scroll">
      <div className="page-container">
        <div
          className="page-heading"
          hidden={["privacy", "security", "network", "tor"].includes(page)}
        >
          <div className="eyebrow">
            RAINCODE /{" "}
            {t(
              ([
                "history",
                "recently-closed",
                "bookmarks",
                "downloads",
                "settings",
                "privacy",
                "network",
                "tor",
                "workspaces",
                "devpanel",
                "system",
                "extensions",
                "licenses",
                "about",
              ].includes(page)
                ? page === "recently-closed"
                  ? "recentlyClosed"
                  : page
                : "about") as MessageKey,
            )}
          </div>
          <h1>
            {page === "privacy"
              ? t("privacyTitle")
              : page === "extensions"
                ? t("extensionTitle")
                : t(
                    page === "recently-closed"
                      ? "recentlyClosed"
                      : (page as MessageKey),
                  )}
          </h1>
          <p>
            {page === "security"
              ? dashboardText(settings.locale, "securityIntro")
              : page === "tor"
                ? torText(settings.locale, "subtitle")
                : t(
                    (
                      {
                        history: "historySubtitle",
                        "recently-closed": "recentlyClosedSubtitle",
                        bookmarks: "bookmarksSubtitle",
                        downloads: "downloadsSubtitle",
                        settings: "settingsSubtitle",
                        privacy: "privacySubtitle",
                        network: "networkSubtitle",
                        workspaces: "workspacesSubtitle",
                        devpanel: "devSubtitle",
                        system: "systemSubtitle",
                        extensions: "extensionBody",
                        about: "aboutBody",
                        licenses: "licenseBody",
                      } as Record<string, MessageKey>
                    )[page] || "aboutBody",
                  )}
          </p>
        </div>
        {["history", "bookmarks"].includes(page) && (
          <>
            <div className="page-actions">
              <div className="filter-input">
                <Search size={16} />
                <input
                  aria-label={t("searchList")}
                  placeholder={t("searchList")}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
              {page === "history" && (
                <Button onClick={() => run({ type: "history.clear" })}>
                  {t("clearHistory")}
                </Button>
              )}
            </div>
            <div className="list card">
              {(page === "history" ? browser.history : browser.bookmarks)
                .filter(match)
                .slice(0, 500)
                .map((item) => (
                  <div className="list-row" key={item.id}>
                    <Globe size={18} />
                    <button
                      className="list-main"
                      onClick={() => run({ type: "navigate", url: item.url })}
                    >
                      <strong>{item.title}</strong>
                      <small>{item.url}</small>
                    </button>
                    <span className="list-date">
                      {new Date(
                        "visitedAt" in item ? item.visitedAt : item.createdAt,
                      ).toLocaleDateString(settings.locale)}
                    </span>
                    {page === "bookmarks" && (
                      <IconButton
                        label={t("remove")}
                        onClick={() =>
                          run({ type: "bookmark.remove", id: item.id })
                        }
                      >
                        <X size={14} />
                      </IconButton>
                    )}
                  </div>
                ))}
              {(page === "history"
                ? browser.history
                : browser.bookmarks
              ).filter(match).length === 0 && (
                <Empty>
                  {t(page === "history" ? "emptyHistory" : "emptyBookmarks")}
                </Empty>
              )}
            </div>
          </>
        )}
        {page === "recently-closed" && (
          <>
            <div className="page-actions">
              <input
                aria-label={t("searchList")}
                placeholder={t("searchList")}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <div className="list card">
              {[...browser.recentlyClosed]
                .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
                .filter(match)
                .map((item) => (
                  <div className="list-row" key={item.id}>
                    {item.favicon?.startsWith("data:image/") ? (
                      <img className="list-favicon" src={item.favicon} alt="" />
                    ) : (
                      <Globe size={18} />
                    )}
                    <div className="list-main">
                      <strong>{item.title}</strong>
                      <small>{item.url}</small>
                    </div>
                    <time
                      className="list-date"
                      dateTime={
                        item.closedAt
                          ? new Date(item.closedAt).toISOString()
                          : undefined
                      }
                    >
                      {item.closedAt
                        ? new Date(item.closedAt).toLocaleString(
                            settings.locale,
                          )
                        : t("previousSession")}
                    </time>
                    <Button
                      onClick={() => run({ type: "tab.restore", id: item.id })}
                    >
                      {t("restore")}
                    </Button>
                  </div>
                ))}
              {!browser.recentlyClosed.filter(match).length && (
                <Empty>{t("emptyClosed")}</Empty>
              )}
            </div>
          </>
        )}
        {page === "downloads" && (
          <div className="list card">
            {browser.downloads.map((item) => (
              <div className="list-row" key={item.id}>
                <Download size={19} />
                <div className="list-main">
                  <strong>{item.name}</strong>
                  <small>
                    {item.status} · {(item.received / 1048576).toFixed(1)} /{" "}
                    {(item.total / 1048576).toFixed(1)} MB
                  </small>
                  <progress value={item.received} max={item.total || 1} />
                </div>
                <Button
                  onClick={() =>
                    run(
                      item.status === "progressing"
                        ? { type: "download.cancel", id: item.id }
                        : { type: "download.reveal", id: item.id },
                    )
                  }
                >
                  {t(item.status === "progressing" ? "cancel" : "showInFolder")}
                </Button>
              </div>
            ))}
            {!browser.downloads.length && <Empty>{t("emptyDownloads")}</Empty>}
          </div>
        )}
        {page === "settings" && <SettingsPage settings={settings} t={t} />}
        {["privacy", "security", "network", "tor"].includes(page) && (
          <PrivacyHub
            browser={browser}
            key={tab?.url}
            locale={settings.locale}
            initialSection={
              privacySections.includes(
                tab?.url.split("#")[1] as (typeof privacySections)[number],
              )
                ? (tab?.url.split("#")[1] as (typeof privacySections)[number])
                : page === "security"
                  ? "security"
                  : page === "network"
                    ? "network"
                    : page === "tor"
                      ? "tor"
                      : "general"
            }
            sections={(open) => ({
              general: (
                <>
                  <PrivacyProof locale={settings.locale} />
                  <SecurityPrivacyDashboard
                    browser={browser}
                    tone="privacy"
                    command={run}
                    onOpen={(page) => {
                      if (page === "security") open("security");
                      else if (page === "tor") open("tor");
                      else if (page === "network") open("network");
                      else run({ type: "navigate", url: `raincode://${page}` });
                    }}
                  />
                </>
              ),
              monitor: <PrivacyMonitorPanel browser={browser} />,
              protection: (
                <>
                  <PrivacyControls settings={settings} />
                  <p className="hint">
                    {privacyHubText(settings.locale, "fingerprint")}
                  </p>
                </>
              ),
              sites: (
                <>
                  <PasswordVault
                    key={
                      browser.tabs.find((t) => t.id === browser.activeTabId)
                        ?.profileId
                    }
                    browser={browser}
                  />
                  <Section title={t("browsing")}>
                    <Toggle
                      label={t("restoreSession")}
                      checked={settings.restoreSession}
                      onChange={(value) =>
                        run({
                          type: "settings.update",
                          settings: { restoreSession: value },
                        })
                      }
                    />
                    <SearchSettings settings={settings} t={t} />
                  </Section>
                  <PrivacyPage browser={browser} t={t} />
                </>
              ),
              security: (
                <SecurityCenter browser={browser} showPrivacyControls={false} />
              ),
              tor: (
                <>
                  <TorStatus
                    tor={browser.tor}
                    locale={settings.locale}
                    warning={t("torWarning")}
                  />
                  <Section title={t("torSearchEngine")}>
                    <SearchSettings settings={settings} t={t} tor />
                  </Section>
                </>
              ),
              network: <NetworkPage browser={browser} t={t} />,
              dns: <DnsControls settings={settings} />,
              ai: <AiPrivacySettings settings={settings} />,
            })}
          />
        )}
        {page === "extensions" && (
          <Section title={t("planned")}>
            <p>{t("extensionBody")}</p>
          </Section>
        )}
        {page === "workspaces" && <WorkspacesPage browser={browser} t={t} />}
        {page === "devpanel" && <DevPage browser={browser} t={t} />}
        {page === "system" && <TasksPage t={t} />}
        {page === "about" && (
          <Section title="RainCode Browser">
            <div className="about-logo">
              <CloudRain size={52} />
            </div>
            <p>
              {t("version")}: {browser.appVersion}
            </p>
            <p>
              {t("chromium")}: {browser.chromiumVersion}
            </p>
            <p>{t("architecture")}</p>
            <p>{t("secureBoundary")}</p>
            <Button onClick={() => openPage("licenses")}>
              {t("licenses")}
            </Button>
          </Section>
        )}
        {page === "licenses" && (
          <Section title={t("licenses")}>
            <p>{t("licenseBody")}</p>
            <p>
              Electron · Chromium · React · TypeScript · Vite · Zustand · Zod ·
              Lucide
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

function SearchSettings({
  settings,
  t,
  tor = false,
}: {
  settings: Settings;
  t: T;
  tor?: boolean;
}) {
  const current = tor ? settings.torSearchTemplate : settings.searchTemplate;
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  return (
    <>
      <label className="field">
        {t(tor ? "torSearchEngine" : "searchEngine")}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="hint">{t(tor ? "torSearchHint" : "searchHint")}</p>
      <Button
        disabled={value === current}
        onClick={() =>
          run({
            type: "settings.update",
            settings: tor
              ? { torSearchTemplate: value }
              : { searchTemplate: value },
          })
        }
      >
        {t("save")}
      </Button>
    </>
  );
}

function SettingsPage({ settings, t }: { settings: Settings; t: T }) {
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const update = (partial: Partial<Settings>) =>
    run({ type: "settings.update", settings: partial });
  const toggles = (keys: (keyof Settings & MessageKey)[]) =>
    keys.map((key) => (
      <Toggle
        key={key}
        label={t(key)}
        checked={!!settings[key]}
        onChange={(value) => update({ [key]: value })}
      />
    ));
  return (
    <div className="settings-grid">
      <nav className="settings-shortcuts" aria-label={t("settings")}>
        {(["appearance", "performance", "browsing"] as const).map((key) => (
          <button
            className="button"
            key={key}
            onClick={() => {
              document
                .getElementById(`settings-${key}`)
                ?.scrollIntoView({ block: "start", behavior: "instant" });
            }}
          >
            {t(key)}
          </button>
        ))}
        <button
          className="button"
          onClick={() => run({ type: "navigate", url: "raincode://privacy" })}
        >
          <Shield size={16} /> {t("privacyTitle")}
        </button>
        <button
          className="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("raincode-open-ai"))
          }
        >
          {t("aiPanel")}
        </button>
      </nav>
      <Section id="settings-appearance" title={t("appearance")}>
        <label className="setting-row">
          {t("language")}
          <select
            value={settings.locale}
            onChange={(e) =>
              update({ locale: e.target.value as Settings["locale"] })
            }
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="setting-row">
          {t("theme")}
          <select
            value={settings.theme}
            onChange={(e) =>
              update({ theme: e.target.value as Settings["theme"] })
            }
          >
            {(
              [
                "london",
                "midnight",
                "fog",
                "amber",
                "graphite",
                "contrast",
              ] as const
            ).map((theme) => (
              <option value={theme} key={theme}>
                {t(theme)}
              </option>
            ))}
          </select>
        </label>
        <AppearanceStudio settings={settings} update={update} />
        {toggles([
          "blur",
          "transparency",
          "highContrast",
          "widgets",
          "verticalTabs",
          "bokeh",
          "glow",
          "cinematic",
        ])}
        <label className="setting-row">
          {t("fontSize")}
          <input
            type="range"
            min="12"
            max="20"
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          />
          <span>{settings.fontSize}</span>
        </label>
        <label className="setting-row">
          {t("brightness")}
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={settings.brightness}
            onChange={(e) => update({ brightness: Number(e.target.value) })}
          />
        </label>
      </Section>
      <Section id="settings-performance" title={t("performance")}>
        <label className="setting-row">
          {t("performanceMode")}
          <select
            aria-label={t("performanceMode")}
            value={settings.performanceMode}
            onChange={(event) =>
              update({
                performanceMode: event.target
                  .value as Settings["performanceMode"],
                fps:
                  event.target.value === "eco"
                    ? 20
                    : event.target.value === "ultra"
                      ? 60
                      : 30,
              })
            }
          >
            <option value="eco">ECO</option>
            <option value="balanced">BALANCED</option>
            <option value="ultra">ULTRA</option>
          </select>
        </label>
        {toggles(["graphicsEnabled"])}
        <label className="setting-row">
          {t("autoSleepMinutes")}
          <select
            aria-label={t("autoSleepMinutes")}
            value={settings.autoSleepMinutes}
            onChange={(event) =>
              update({
                autoSleepMinutes: Number(
                  event.target.value,
                ) as Settings["autoSleepMinutes"],
              })
            }
          >
            <option value={0}>{t("off")}</option>
            {[5, 15, 30, 60].map((value) => (
              <option key={value} value={value}>
                {value} {t("minutes")}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">{t("sleepHint")}</p>
        <label className="setting-row">
          {t("rainQuality")}
          <select
            value={settings.rain}
            onChange={(e) =>
              update({ rain: e.target.value as Settings["rain"] })
            }
          >
            {(["off", "low", "medium", "high", "cinematic"] as const).map(
              (quality) => (
                <option value={quality} key={quality}>
                  {t(quality)}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="setting-row">
          {t("fps")}
          <select
            value={settings.fps}
            onChange={(e) => update({ fps: Number(e.target.value) })}
          >
            {[15, 20, 24, 30, 60].map((fps) => (
              <option key={fps}>{fps}</option>
            ))}
          </select>
        </label>
        {toggles(["parallax", "powerSave"])}
        <label className="setting-row">
          {t("motionPreference")}
          <select
            aria-label={t("motionPreference")}
            value={settings.motionPreference}
            onChange={(event) =>
              update({
                motionPreference: event.target
                  .value as Settings["motionPreference"],
              })
            }
          >
            <option value="system">{t("motionSystem")}</option>
            <option value="full">{t("motionFull")}</option>
            <option value="reduced">{t("motionReduced")}</option>
          </select>
        </label>
        {(settings.motionPreference === "reduced" ||
          (settings.motionPreference === "system" && systemReduced)) && (
          <p className="hint" role="status">
            {t("motionPaused")}
          </p>
        )}
        <p className="hint">{t("motionHint")}</p>
      </Section>
      <Section id="settings-browsing" title={t("browsing")}>
        <Button
          onClick={() => run({ type: "navigate", url: "raincode://privacy" })}
        >
          <Shield size={16} /> {t("privacyTitle")}
        </Button>
        <div className="button-row">
          <Button
            onClick={() => run({ type: "action", action: "exportSettings" })}
          >
            {t("exportSettings")}
          </Button>
          <Button
            onClick={() => run({ type: "action", action: "importSettings" })}
          >
            {t("importSettings")}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function PrivacyPage({ browser, t }: { browser: BrowserState; t: T }) {
  const [origin, setOrigin] = useState("");
  return (
    <>
      <Section title={t("noTelemetry")}>
        <div className="privacy-badges">
          <span>
            <Check size={16} />
            {t("noAds")}
          </span>
          <span>
            <Check size={16} />
            {t("localOnly")}
          </span>
          <span>
            <Check size={16} />
            {t("secureBoundary")}
          </span>
        </div>
        <p>{t("privacyBody")}</p>
        <Button
          onClick={() => {
            const profile = browser.profiles.find((p) => p.mode === "private");
            if (profile) run({ type: "tab.create", profileId: profile.id });
            else
              void send({
                type: "profile.create",
                name: t("private"),
                mode: "private",
              }).then((result) => {
                if (result.ok && typeof result.data === "string")
                  run({ type: "tab.create", profileId: result.data });
              });
          }}
        >
          {t("newPrivate")}
        </Button>
      </Section>
      <Section title={t("permissions")}>
        {browser.permissions.map((permission, i) => (
          <div className="list-row" key={i}>
            <Shield size={17} />
            <div className="list-main">
              <strong>{permission.origin}</strong>
              <small>
                {permission.permission} ·{" "}
                {t(
                  permission.allowed ? "permissionAllowed" : "permissionDenied",
                )}
              </small>
            </div>
            <Button
              onClick={() =>
                run({
                  type: "permission.revoke",
                  origin: permission.origin,
                  permission: permission.permission,
                  profileId: permission.profileId,
                })
              }
            >
              {t("revoke")}
            </Button>
          </div>
        ))}
        {!browser.permissions.length && (
          <p className="hint">{t("noPermissions")}</p>
        )}
      </Section>
      <Section title={t("siteData")}>
        <label className="field">
          {t("origin")}
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </label>
        <p className="hint">{t("clearDataHint")}</p>
        <Button
          disabled={!origin}
          onClick={() => run({ type: "site.clear", origin })}
        >
          {t("clearSite")}
        </Button>
      </Section>
      <TrackerPanel
        key={
          browser.tabs.find((tab) => tab.id === browser.activeTabId)?.profileId
        }
        settings={browser.settings}
        profileId={
          browser.tabs.find((tab) => tab.id === browser.activeTabId)
            ?.profileId || "default"
        }
      />
    </>
  );
}

function NetworkPage({ browser, t }: { browser: BrowserState; t: T }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"direct" | "proxy" | "private">("direct");
  const [scheme, setScheme] = useState<"socks5" | "http" | "https">("socks5");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(1080);
  const [bypassLocal, setBypassLocal] = useState(false);
  const [result, setResult] = useState("");
  return (
    <>
      <Section title={t("profiles")}>
        {browser.profiles.map((profile) => (
          <Fragment key={profile.id}>
            <div className="list-row">
              <div className={`profile-mode mode-${profile.mode}`}>
                <Shield size={21} />
              </div>
              <div className="list-main">
                <strong>
                  {profile.name}
                  <span className="badge">{t(profile.mode)}</span>
                </strong>
                <small>
                  {profile.proxy
                    ? `${profile.proxy.scheme}://${profile.proxy.host}:${profile.proxy.port}`
                    : t(
                        profile.mode === "direct"
                          ? "directDescription"
                          : "privateDescription",
                      )}
                </small>
              </div>
              <Button
                onClick={() =>
                  run({ type: "tab.create", profileId: profile.id })
                }
              >
                {t("openProfile")}
              </Button>
              {profile.mode === "proxy" && (
                <Button
                  onClick={() => {
                    setResult(t("loading"));
                    void send({
                      type: "proxy.test",
                      profileId: profile.id,
                    }).then((result) =>
                      setResult(
                        result.ok
                          ? JSON.stringify(result.data)
                          : result.error || t("error"),
                      ),
                    );
                  }}
                >
                  {t("test")}
                </Button>
              )}
              {profile.id !== "default" && (
                <IconButton
                  label={t("remove")}
                  onClick={() => {
                    run({ type: "profile.delete", id: profile.id });
                  }}
                >
                  <X size={15} />
                </IconButton>
              )}
            </div>
            {profile.mode === "proxy" && (
              <div className="card section">
                <ProxyRoute
                  key={profile.id}
                  profile={profile}
                  locale={browser.settings.locale}
                  hasWebTabs={browser.tabs.some(
                    (tab) =>
                      tab.profileId === profile.id &&
                      !tab.url.startsWith("raincode://"),
                  )}
                />
                <ProxyCredentials
                  key={JSON.stringify(profile.proxy)}
                  profile={profile}
                  available={browser.secretsAvailable === true}
                  locale={browser.settings.locale}
                />
              </div>
            )}
          </Fragment>
        ))}
        <p className="hint">{t("ipHint")}</p>
        {result && <pre>{result}</pre>}
        <Button onClick={() => run({ type: "proxy.disconnect" })}>
          {t("disconnect")}
        </Button>
      </Section>
      <Section title={t("createProfile")}>
        <div className="form-grid">
          <label className="field">
            {t("profileName")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </label>
          <label className="field">
            {t("mode")}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              {(["direct", "proxy", "private"] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {t(mode)}
                </option>
              ))}
            </select>
          </label>
          {mode === "proxy" && (
            <>
              <label className="field">
                {t("scheme")}
                <select
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value as typeof scheme)}
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
              </label>
              <label className="field">
                {t("host")}
                <input value={host} onChange={(e) => setHost(e.target.value)} />
              </label>
              <label className="field">
                {t("port")}
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </label>
              <Toggle
                label={t("bypassLocal")}
                checked={bypassLocal}
                onChange={setBypassLocal}
              />
            </>
          )}
        </div>
        {mode === "proxy" && <p className="hint">{t("proxyHint")}</p>}
        <Button
          className="primary"
          disabled={!name.trim()}
          onClick={() => {
            void send({
              type: "profile.create",
              name,
              mode,
              ...(mode === "proxy"
                ? { proxy: { scheme, host, port, bypassLocal } }
                : {}),
            }).then((result) => {
              if (result.ok) setName("");
            });
          }}
        >
          {t("createProfile")}
        </Button>
      </Section>
    </>
  );
}

function WorkspacesPage({ browser, t }: { browser: BrowserState; t: T }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState(browser.notes);
  const [snippets, setSnippets] = useState(browser.snippets);
  return (
    <>
      <Section title={t("workspaces")}>
        <div className="inline-form">
          <input
            aria-label={t("workspaceName")}
            placeholder={t("workspaceName")}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              void send({ type: "workspace.save", name }).then((result) => {
                if (result.ok) setName("");
              });
            }}
          >
            {t("saveWorkspace")}
          </Button>
        </div>
        <p className="hint">{t("workspaceHint")}</p>
        {browser.workspaces.map((workspace) => (
          <div className="list-row" key={workspace.id}>
            <Layers size={21} />
            <div className="list-main">
              <strong>{workspace.name}</strong>
              <small>
                {workspace.urls.length} {t("tabCount")} · {workspace.profileId}
              </small>
            </div>
            <Button
              onClick={() => run({ type: "workspace.open", id: workspace.id })}
            >
              {t("open")}
            </Button>
            <IconButton
              label={t("remove")}
              onClick={() =>
                run({ type: "workspace.delete", id: workspace.id })
              }
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
        {!browser.workspaces.length && <Empty>{t("emptyWorkspaces")}</Empty>}
      </Section>
      <Section title={t("project")}>
        <p className="mono">{browser.projectPath || t("noProject")}</p>
        <Button onClick={() => run({ type: "action", action: "project" })}>
          <Folder size={16} />
          {t("connectProject")}
        </Button>
      </Section>
      <div className="settings-grid">
        <Section title={t("notes")}>
          <textarea
            rows={9}
            value={notes}
            placeholder={t("notesPlaceholder")}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button onClick={() => run({ type: "notes.save", notes, snippets })}>
            {t("save")}
          </Button>
        </Section>
        <Section title={t("snippets")}>
          <textarea
            className="mono"
            rows={9}
            value={snippets}
            placeholder={t("snippetsPlaceholder")}
            onChange={(e) => setSnippets(e.target.value)}
          />
          <Button onClick={() => run({ type: "notes.save", notes, snippets })}>
            {t("save")}
          </Button>
        </Section>
      </div>
    </>
  );
}

function DevPage({ browser, t }: { browser: BrowserState; t: T }) {
  const { developerTargetId: targetId, setDeveloperTargetId: setTargetId } =
    useBrowser();
  const pages = browser.tabs.filter((tab) => /^https?:\/\//.test(tab.url));
  const target = pages.find((tab) => tab.id === targetId) || pages.at(-1);
  const [data, setData] = useState<unknown>(null);
  const [ports, setPorts] = useState<unknown>(null);
  const [userAgent, setUserAgent] = useState("");
  const [css, setCss] = useState("");
  const configuration = browser.devState?.[target?.id || ""] || {
    offline: false,
    slow: false,
    mobile: false,
    noCache: false,
  };
  const [section, setSection] = useState<MessageKey>("pageInfo");
  const keys: MessageKey[] = [
    "pageInfo",
    "network",
    "storage",
    "cookies",
    "headers",
    "security",
    "permissions",
    "performanceTab",
    "accessibility",
    "tor",
    "proxy",
    "localProjects",
    "snippets",
    "notes",
  ];
  const inspect = () => {
    void send({ type: "dev.info", tabId: target?.id }).then((result) => {
      if (result.ok) setData(result.data);
    });
  };
  return (
    <>
      <label className="field">
        {developerText(browser.settings.locale, "quickTarget")}
        <select
          aria-label={developerText(browser.settings.locale, "quickTarget")}
          value={target?.id || ""}
          onChange={(event) => {
            setTargetId(event.target.value);
            setData(null);
          }}
        >
          {!pages.length && (
            <option value="">
              {developerText(browser.settings.locale, "noTarget")}
            </option>
          )}
          {pages.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.title}
            </option>
          ))}
        </select>
      </label>
      <div className="dev-tabs">
        {keys.map((key) => (
          <button
            className={section === key ? "selected" : ""}
            key={key}
            onClick={() => setSection(key)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <Section title={t(section)}>
        {section === "pageInfo" && target && (
          <SiteDiagnosticsPanel
            key={`${target.id}:${target.url}`}
            tabId={target.id}
            locale={browser.settings.locale}
          />
        )}
        <p>{t("devHint")}</p>
        <div className="button-row">
          <Button disabled={!target} onClick={inspect}>
            {t("inspect")}
          </Button>
          <Button
            disabled={!target}
            onClick={() =>
              run({
                type: "dev.tools",
                mode: browser.settings.devToolsMode,
                tabId: target?.id,
              })
            }
          >
            <Code2 size={16} />
            {t("devtools")}
          </Button>
        </div>
        {section === "tor" && (
          <>
            <p className="hint">
              {browser.tor?.bundled
                ? torText(browser.settings.locale, browser.tor.status)
                : torText(browser.settings.locale, "unavailable")}
            </p>
            <Button
              onClick={() => run({ type: "navigate", url: "raincode://tor" })}
            >
              {t("tor")}
            </Button>
          </>
        )}
        {section === "proxy" && (
          <p className="hint">
            {browser.profiles
              .filter((p) => p.mode === "proxy")
              .map((p) => p.name)
              .join(", ") || t("noData")}
          </p>
        )}
        {section === "permissions" && (
          <pre>{JSON.stringify(browser.permissions, null, 2)}</pre>
        )}
        {section === "localProjects" && (
          <>
            <p>{browser.projectPath || t("noProject")}</p>
            <Button onClick={() => run({ type: "action", action: "project" })}>
              {t("connectProject")}
            </Button>
            <Button
              onClick={() => {
                void send({ type: "dev.ports" }).then((result) => {
                  if (result.ok) setPorts(result.data);
                });
              }}
            >
              {t("discoverPorts")}
            </Button>
            <p className="hint">{t("portsHint")}</p>
            {Array.isArray(ports) && ports.length === 0 && (
              <p className="hint">{t("noPorts")}</p>
            )}
            {Array.isArray(ports) &&
              ports.map((value: unknown) => {
                if (
                  typeof value !== "object" ||
                  value === null ||
                  !("url" in value) ||
                  typeof value.url !== "string"
                )
                  return null;
                const url = value.url;
                return (
                  <div className="list-row" key={url}>
                    <Terminal size={17} />
                    <span className="list-main mono">{url}</span>
                    <Button onClick={() => run({ type: "tab.create", url })}>
                      {t("open")}
                    </Button>
                  </div>
                );
              })}
          </>
        )}
        {(section === "snippets" || section === "notes") && (
          <pre>{browser[section] || t("noData")}</pre>
        )}
        {data !== null && (
          <pre className="data-view">{JSON.stringify(data, null, 2)}</pre>
        )}
      </Section>
      <Section title={t("network")}>
        <div className="dev-options">
          {(["offline", "slow", "mobile", "noCache"] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={configuration[key]}
                disabled={!target}
                onChange={(event) => {
                  run({
                    type: "dev.configure",
                    tabId: target?.id,
                    [key]: event.target.checked,
                  });
                }}
              />
              {t(key)}
            </label>
          ))}
        </div>
        <p className="hint">
          {developerText(browser.settings.locale, "mobileHint")}
        </p>
        <label className="field">
          {t("userAgent")}
          <input
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
          />
        </label>
        <Button
          disabled={!target}
          onClick={() =>
            run({ type: "dev.configure", userAgent, tabId: target?.id })
          }
        >
          {t("apply")}
        </Button>
      </Section>
      <Section title={t("customCss")}>
        <textarea
          className="mono"
          rows={6}
          value={css}
          onChange={(e) => setCss(e.target.value)}
          placeholder={t("cssPlaceholder")}
        />
        <Button
          disabled={!target || !css.trim()}
          onClick={() => run({ type: "dev.css", css, tabId: target?.id })}
        >
          {t("apply")}
        </Button>
        <Button
          onClick={() => {
            setCss("");
            if (target) run({ type: "dev.css", css: "", tabId: target.id });
          }}
        >
          {t("clear")}
        </Button>
      </Section>
      <DeveloperWorkspace browser={browser} />
    </>
  );
}

function TasksPage({ t }: { t: T }) {
  const [data, setData] = useState<unknown>(null);
  const refresh = () => {
    void send({ type: "dev.tasks" }).then((result) => {
      if (result.ok) setData(result.data);
    });
  };
  useEffect(refresh, []);
  return (
    <Section title={t("system")}>
      <Button onClick={refresh}>
        <RotateCw size={15} />
        {t("refresh")}
      </Button>
      {Array.isArray(data) ? (
        <div className="task-table">
          <table>
            <thead>
              <tr>
                <th>{t("task")}</th>
                <th>{t("pid")}</th>
                <th>{t("cpu")}</th>
                <th>{t("memory")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((value: Record<string, unknown>, i) => (
                <tr key={String(value.id || i)}>
                  <td>
                    <strong>{String(value.title || "")}</strong>
                    <small>{String(value.url || "")}</small>
                  </td>
                  <td>{String(value.pid || "—")}</td>
                  <td>{Number(value.cpu || 0).toFixed(1)} %</td>
                  <td>{(Number(value.memory || 0) / 1024).toFixed(1)} MB</td>
                  <td>
                    <IconButton
                      label={t("closeTab")}
                      onClick={() =>
                        run({ type: "tab.close", id: String(value.id) })
                      }
                    >
                      <X size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t("noData")}</Empty>
      )}
    </Section>
  );
}
