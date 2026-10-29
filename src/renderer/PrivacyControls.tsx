import { useEffect, useState } from "react";
import type { Settings } from "../shared/contracts";
import {
  resolvePrivacyPolicy,
  type PrivacyConfig,
} from "../shared/privacy-policy";
import { send } from "./store";
import "./privacy-controls.css";

const texts = {
  ru: {
    title: "Защита приватности",
    level: "Уровень защиты",
    standard: "Стандартный",
    strict: "Строгий",
    maximum: "Максимальный",
    standardDescription:
      "Блокирует известные трекеры, сохраняет cookies и JavaScript для совместимости",
    strictDescription:
      "Ограничивает межсайтовые cookies и подробные Client Hints в HTTP. Возможны проблемы входа и подбора изображений; JS-отпечаток не унифицируется",
    maximumDescription:
      "Также отключает JavaScript — интерактивные сайты могут не работать",
    presetsHint:
      "Выбор другого уровня сбрасывает ручные настройки ниже, исключения сайтов сохраняются",
    trackers: "Известные рекламные трекеры",
    cookies: "Cookie HTTP между разными origin",
    javascript: "JavaScript сайтов",
    auto: "По уровню защиты",
    allow: "Разрешить",
    block: "Блокировать",
    apply: "Применить защиту",
    applying: "Применение…",
    hint: "Эти настройки ограничивают отслеживание и возможности сайтов, но не гарантируют анонимность, в том числе через Tor",
    technical:
      "Ограничение cookies удаляет заголовки Cookie и Set-Cookie у сетевых запросов между разными origin — это не полная изоляция cookies или JavaScript-хранилищ сторонних фреймов",
    warning:
      "Применение закроет текущие контексты страниц и соединения. Сначала сохраните формы, затем обновите вкладки",
    blockerWarning:
      "Блокировщик сейчас выключен — применение защиты также включит его",
    origin: "Исключение для точного адреса сайта",
    add: "Сохранить исключение",
    remove: "Удалить исключение",
    invalid: "Введите HTTP(S) origin без пути, логина и параметров",
    saved: "Настройки применены — обновите страницы",
    effective: "После применения",
    active: "Применено",
    pending: "Есть неприменённые изменения",
    current: "Все изменения применены",
    reset: "Отменить изменения",
    exact:
      "Исключения относятся только к указанному origin: схема, домен и порт. Добавление и удаление вступят в силу после нажатия «Применить защиту»",
    dataTitle: "Данные и соединения",
    immediate: "Эти переключатели сохраняются сразу",
    historyEnabled: "Сохранять историю посещений",
    historyHint:
      "Отключение остановит запись новых посещений, но не удалит уже сохранённую историю",
    clearOnExit: "Очищать данные сайтов при выходе",
    clearHint:
      "Удаляет cookies, хранилища сайтов и кеш при обычном закрытии браузера. История, закладки и скачанные файлы сохраняются",
    httpsOnly: "Только защищённые соединения HTTPS",
    httpsHint:
      "Переводит обычные HTTP-запросы на HTTPS, блокирует отправку форм по HTTP и ws://. Исключения: локальные адреса и onion v3 через Tor. Не шифрует весь трафик устройства или системный DNS",
    httpsWarning:
      "Включение закроет соединения страниц и отменит текущие загрузки — сохраните формы, затем обновите вкладки",
    preferenceSaved: "Настройка сохранена",
    error: "Не удалось сохранить настройку",
  },
  en: {
    title: "Privacy protection",
    level: "Protection level",
    standard: "Standard",
    strict: "Strict",
    maximum: "Maximum",
    standardDescription:
      "Blocks known trackers, keeps cookies and JavaScript for compatibility",
    strictDescription:
      "Also restricts cookies between site origins — sign-in and embedded content may break",
    maximumDescription:
      "Also disables JavaScript — interactive websites may stop working",
    presetsHint:
      "Choosing another level resets the manual choices below and keeps site exceptions",
    trackers: "Known advertising trackers",
    cookies: "Cross-origin HTTP cookies",
    javascript: "Website JavaScript",
    auto: "Follow protection level",
    allow: "Allow",
    block: "Block",
    apply: "Apply protection",
    applying: "Applying…",
    hint: "These settings limit tracking and website capabilities, but do not guarantee anonymity, including over Tor",
    technical:
      "Cookie restrictions remove Cookie and Set-Cookie headers from cross-origin network requests — this is not complete isolation of third-party cookies or JavaScript storage",
    warning:
      "Applying closes existing page contexts and connections. Save forms first, then reload tabs",
    blockerWarning:
      "The blocker is currently off — applying protection will also enable it",
    origin: "Exact site origin exception",
    add: "Save exception",
    remove: "Remove exception",
    invalid: "Enter an HTTP(S) origin without path, credentials or query",
    saved: "Settings applied — reload pages",
    effective: "After applying",
    active: "Applied",
    pending: "Changes waiting to be applied",
    current: "All changes applied",
    reset: "Discard changes",
    exact:
      "Exceptions apply only to the specified origin: scheme, hostname and port. Additions and removals take effect after Apply protection",
    dataTitle: "Data and connections",
    immediate: "These switches save immediately",
    historyEnabled: "Save browsing history",
    historyHint:
      "Turning this off stops recording new visits and keeps existing history",
    clearOnExit: "Clear site data on exit",
    clearHint:
      "Clears cookies, site storage and cache when the browser closes normally. History, bookmarks and downloaded files remain",
    httpsOnly: "HTTPS-only connections",
    httpsHint:
      "Upgrades public HTTP requests to HTTPS and blocks HTTP form submissions and ws://. Exceptions: loopback addresses and onion v3 over Tor. Does not encrypt all device traffic or system DNS",
    httpsWarning:
      "Enabling closes page connections and cancels current downloads — save forms first, then reload tabs",
    preferenceSaved: "Setting saved",
    error: "Could not save setting",
  },
};

// Normalize optional keys so a reverted choice is not mistaken for a change.
function configKey(config: PrivacyConfig) {
  const policy = (value: Partial<Omit<PrivacyConfig, "siteOverrides">>) => ({
    level: value.level,
    trackers: value.trackers,
    crossOriginCookies: value.crossOriginCookies,
    javascript: value.javascript,
  });
  return JSON.stringify({
    blockWebGL: !!config.blockWebGL,
    ...policy(config),
    siteOverrides: config.siteOverrides.map((site) => ({
      origin: site.origin,
      ...policy(site),
    })),
  });
}

export function PrivacyControls({ settings }: { settings: Settings }) {
  const t = texts[settings.locale];
  const appliedKey = configKey(settings.privacy);
  const [draft, setDraft] = useState<PrivacyConfig>(settings.privacy);
  const [origin, setOrigin] = useState("");
  const [site, setSite] = useState<PrivacyConfig["siteOverrides"][number]>({
    origin: "",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // Browser state updates can recreate privacy objects without changing policy.
  // Preserve edits when an unrelated preference or tab changes.
  const [lastAppliedKey, setLastAppliedKey] = useState(appliedKey);
  useEffect(() => {
    if (lastAppliedKey !== appliedKey) {
      setDraft(settings.privacy);
      setLastAppliedKey(appliedKey);
    }
  }, [appliedKey, lastAppliedKey, settings.privacy]);
  const changed = configKey(draft) !== appliedKey;
  const effective = resolvePrivacyPolicy(draft, "");
  const applied = resolvePrivacyPolicy(settings.privacy, "");
  function edit(next: PrivacyConfig) {
    setDraft(next);
    setStatus("");
  }
  function chooseLevel(level: PrivacyConfig["level"]) {
    if (level !== draft.level)
      edit({ level, siteOverrides: draft.siteOverrides });
  }
  const choices = (
    value: "allow" | "block" | undefined,
    change: (v: "allow" | "block" | undefined) => void,
    label: string,
  ) => (
    <label className="setting-row">
      {label}
      <select
        aria-label={label}
        value={value || "auto"}
        disabled={busy}
        onChange={(e) =>
          change(
            e.target.value === "auto"
              ? undefined
              : (e.target.value as "allow" | "block"),
          )
        }
      >
        <option value="auto">{t.auto}</option>
        <option value="allow">{t.allow}</option>
        <option value="block">{t.block}</option>
      </select>
    </label>
  );
  async function apply() {
    if (busy || (!changed && settings.adBlock)) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await send({
        type: "settings.update",
        settings: { privacy: draft, adBlock: true },
      });
      setStatus(result.ok ? t.saved : result.error || t.error);
    } finally {
      setBusy(false);
    }
  }
  async function updatePreference(
    key: "historyEnabled" | "clearOnExit" | "httpsOnly",
    value: boolean,
  ) {
    setBusy(true);
    setStatus("");
    try {
      const result = await send({
        type: "settings.update",
        settings: { [key]: value },
      });
      setStatus(
        result.ok
          ? key === "httpsOnly" && value
            ? t.saved
            : t.preferenceSaved
          : result.error || t.error,
      );
    } finally {
      setBusy(false);
    }
  }
  function addSite() {
    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin !== origin ||
        url.username ||
        url.password
      )
        throw new Error();
      edit({
        ...draft,
        siteOverrides: [
          ...draft.siteOverrides.filter((item) => item.origin !== origin),
          { ...site, origin },
        ],
      });
      setOrigin("");
      setSite({ origin: "" });
    } catch {
      setStatus(t.invalid);
    }
  }
  const summary = (policy: typeof effective) => (
    <span>
      {t.trackers} — {t[policy.trackers]}; {t.cookies} —{" "}
      {t[policy.crossOriginCookies]}; {t.javascript} — {t[policy.javascript]}
    </span>
  );
  return (
    <section className="card section privacy-controls" aria-label={t.title}>
      <h2>{t.title}</h2>
      <p className="hint">{t.hint}</p>
      <div className="privacy-presets" role="group" aria-label={t.level}>
        {(["standard", "strict", "maximum"] as const).map((level) => (
          <button
            key={level}
            type="button"
            className="privacy-preset"
            aria-label={t[level]}
            aria-pressed={draft.level === level}
            disabled={busy}
            onClick={() => chooseLevel(level)}
          >
            <strong>{t[level]}</strong>
            <span>{t[`${level}Description`]}</span>
          </button>
        ))}
      </div>
      <p className="hint">{t.presetsHint}</p>
      <label className="setting-row">
        {t.level}
        <select
          aria-label={t.level}
          value={draft.level}
          disabled={busy}
          onChange={(e) =>
            chooseLevel(e.target.value as PrivacyConfig["level"])
          }
        >
          {(["standard", "strict", "maximum"] as const).map((level) => (
            <option key={level} value={level}>
              {t[level]}
            </option>
          ))}
        </select>
      </label>
      {choices(
        draft.trackers,
        (v) => edit({ ...draft, trackers: v }),
        t.trackers,
      )}
      {choices(
        draft.crossOriginCookies,
        (v) => edit({ ...draft, crossOriginCookies: v }),
        t.cookies,
      )}
      {choices(
        draft.javascript,
        (v) => edit({ ...draft, javascript: v }),
        t.javascript,
      )}
      <p className="hint">{t.technical}</p>
      <div className="privacy-policy-summary">
        <p>
          <strong>
            {t.active}: {t[settings.privacy.level]}
          </strong>
          <br />
          {summary(applied)}
        </p>
        {changed && (
          <p>
            <strong>
              {t.effective}: {t[draft.level]}
            </strong>
            <br />
            {summary(effective)}
          </p>
        )}
        {!settings.adBlock && <p>{t.blockerWarning}</p>}
      </div>
      <details className="privacy-exceptions">
        <summary>
          {t.origin} ({draft.siteOverrides.length})
        </summary>
        <p className="hint">{t.exact}</p>
        <input
          aria-label={t.origin}
          placeholder="https://example.com"
          value={origin}
          disabled={busy}
          onChange={(e) => setOrigin(e.target.value)}
        />
        {choices(
          site.trackers,
          (v) => setSite({ ...site, trackers: v }),
          `${t.origin}: ${t.trackers}`,
        )}
        {choices(
          site.crossOriginCookies,
          (v) => setSite({ ...site, crossOriginCookies: v }),
          `${t.origin}: ${t.cookies}`,
        )}
        {choices(
          site.javascript,
          (v) => setSite({ ...site, javascript: v }),
          `${t.origin}: ${t.javascript}`,
        )}
        <button className="button" disabled={busy || !origin} onClick={addSite}>
          {t.add}
        </button>
        {draft.siteOverrides.map((item) => (
          <div className="list-row" key={item.origin}>
            <code>{item.origin}</code>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                edit({
                  ...draft,
                  siteOverrides: draft.siteOverrides.filter(
                    (entry) => entry.origin !== item.origin,
                  ),
                })
              }
            >
              {t.remove}
            </button>
          </div>
        ))}
      </details>
      <div className="privacy-apply-area">
        <p className="privacy-change-state" aria-live="polite">
          {changed ? t.pending : t.current}
        </p>
        {(changed || !settings.adBlock) && <p className="hint">{t.warning}</p>}
        <div className="privacy-actions">
          <button
            className="button"
            disabled={busy || (!changed && settings.adBlock)}
            onClick={() => void apply()}
          >
            {busy ? t.applying : t.apply}
          </button>
          {changed && (
            <button
              className="button"
              disabled={busy}
              onClick={() => edit(settings.privacy)}
            >
              {t.reset}
            </button>
          )}
        </div>
      </div>
      <div className="privacy-data-controls">
        <label className="setting-row">
          {settings.locale === "ru"
            ? "Запретить WebGL (3D-графику)"
            : "Block WebGL (3D graphics)"}
          <input
            type="checkbox"
            role="switch"
            aria-label={
              settings.locale === "ru" ? "Запретить WebGL" : "Block WebGL"
            }
            checked={!!draft.blockWebGL}
            onChange={(e) => edit({ ...draft, blockWebGL: e.target.checked })}
          />
        </label>
        <p className="hint">
          {settings.locale === "ru"
            ? "После применения отключает WebGL/WebGL2 средствами движка. Карты, игры и 3D могут не работать. Canvas2D, Audio, CSS-шрифты и WebGPU этим переключателем не унифицируются. В Tor WebGL отключён всегда."
            : "After applying, disables WebGL/WebGL2 in the engine. Maps, games and 3D may break. This does not standardize Canvas2D, Audio, CSS fonts or WebGPU. WebGL is always disabled in Tor."}
        </p>
        <h3>{t.dataTitle}</h3>
        <p className="hint">{t.immediate}</p>
        {(["historyEnabled", "clearOnExit", "httpsOnly"] as const).map(
          (key) => (
            <div className="privacy-data-option" key={key}>
              <label className="setting-row">
                {t[key]}
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t[key]}
                  aria-describedby={`privacy-${key}-hint`}
                  checked={settings[key]}
                  disabled={busy}
                  onChange={(e) => void updatePreference(key, e.target.checked)}
                />
              </label>
              <p className="hint" id={`privacy-${key}-hint`}>
                {key === "historyEnabled"
                  ? t.historyHint
                  : key === "clearOnExit"
                    ? t.clearHint
                    : t.httpsHint}
              </p>
              {key === "httpsOnly" && !settings.httpsOnly && (
                <p className="hint">{t.httpsWarning}</p>
              )}
            </div>
          ),
        )}
      </div>
      {status && <p role="status">{status.replace(/[.。]+$/u, "")}</p>}
    </section>
  );
}
