import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Globe,
  LockKeyhole,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { BrowserState, PrivacySection } from "../shared/contracts";
import type { PrivacyLevel } from "../shared/privacy-policy";
import type { SecurityAudit } from "../shared/security-center";
import { send } from "./store";

export function ShieldOverview({
  browser,
  onOpen,
}: {
  browser: BrowserState;
  onOpen: (section: PrivacySection) => void;
}) {
  const ru = browser.settings.locale === "ru";
  const tab = browser.tabs.find((item) => item.id === browser.activeTabId);
  const profile = browser.profiles.find((item) => item.id === tab?.profileId);
  const [pending, setPending] = useState<PrivacyLevel>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [audit, setAudit] = useState<SecurityAudit>();
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setAudit(undefined);
    setNotice("");
  }, [profile?.id]);
  const level = browser.settings.privacy.level;
  const names = {
    standard: "STANDARD",
    strict: "ENHANCED",
    maximum: "MAXIMUM PRIVACY",
  };
  const torStatus = browser.tor?.status || "stopped";
  const torNames = ru
    ? {
        stopped: "Выключен",
        starting: "Запуск",
        bootstrapping: "Подключение",
        ready: "Демон готов",
        error: "Ошибка",
      }
    : {
        stopped: "Stopped",
        starting: "Starting",
        bootstrapping: "Connecting",
        ready: "Daemon ready",
        error: "Error",
      };
  const route =
    browser.settings.networkKillSwitch || profile?.proxyBlocked
      ? ru
        ? "Соединения заблокированы"
        : "Connections blocked"
      : profile?.mode === "tor"
        ? torStatus === "ready"
          ? "Tor / SOCKS"
          : ru
            ? "Tor недоступен — доступ закрыт"
            : "Tor unavailable — fail closed"
        : profile?.mode === "proxy"
          ? ru
            ? "Прокси профиля"
            : "Profile proxy"
          : ru
            ? "Прямое соединение"
            : "Direct connection";
  const diagnosticPassed =
    audit &&
    audit.pages.length > 0 &&
    !Object.values(audit.unsafeFlags).some(Boolean) &&
    audit.pages.every(
      (page) =>
        page.sandbox &&
        page.contextIsolation &&
        !page.nodeIntegration &&
        page.webSecurity,
    );
  async function inspect() {
    if (busy) return;
    const current = generation.current;
    setBusy(true);
    setNotice("");
    try {
      const result = await send({ type: "security.audit" });
      if (current !== generation.current) return;
      if (result.ok) setAudit(result.data as SecurityAudit);
      else setNotice(ru ? "Диагностика не выполнена" : "Diagnostics failed");
    } finally {
      setBusy(false);
    }
  }
  async function applyMode() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await send({
        type: "settings.update",
        settings: {
          privacy: {
            level: pending,
            siteOverrides: browser.settings.privacy.siteOverrides,
          },
          adBlock: true,
        },
      });
      if (result.ok) {
        setPending(undefined);
        setNotice(
          ru
            ? "Режим применён. Обновите приостановленные страницы"
            : "Mode applied. Reload suspended pages",
        );
      } else
        setNotice(ru ? "Не удалось применить режим" : "Could not apply mode");
    } finally {
      setBusy(false);
    }
  }
  const cards: { level: PrivacyLevel; body: string; icon: typeof Shield }[] = [
    {
      level: "standard",
      icon: Shield,
      body: ru
        ? "Известные трекеры блокируются; cookies и JavaScript сохраняются для совместимости"
        : "Blocks known trackers; keeps cookies and JavaScript for compatibility",
    },
    {
      level: "strict",
      icon: ShieldCheck,
      body: ru
        ? "Ограничивает межсайтовые HTTP cookies и подробные Client Hints. Вход и подбор изображений могут измениться"
        : "Restricts cross-origin HTTP cookies and detailed Client Hints. Sign-in and image selection may change",
    },
    {
      level: "maximum",
      icon: LockKeyhole,
      body: ru
        ? "Дополнительно отключает JavaScript. Интерактивные сайты могут не работать; маршрут Tor выбирается отдельно"
        : "Also disables JavaScript. Interactive sites may break; select the Tor route separately",
    },
  ];
  return (
    <section
      className="shield-overview"
      aria-label={ru ? "Обзор Rain Shield" : "Rain Shield overview"}
    >
      <div className="shield-status-grid">
        <article className="shield-status-card">
          <Shield size={19} aria-hidden="true" />
          <span>{ru ? "Режим приватности" : "Privacy mode"}</span>
          <strong>{names[level]}</strong>
          <small>
            {ru
              ? "Исключения сайтов учитываются отдельно"
              : "Site exceptions apply separately"}
          </small>
        </article>
        <article className="shield-status-card">
          <Globe size={19} aria-hidden="true" />
          <span>{ru ? "Сетевая политика" : "Network policy"}</span>
          <strong>{route}</strong>
          <small>
            {ru
              ? "Это конфигурация, не внешняя проверка IP"
              : "Configuration, not external IP verification"}
          </small>
        </article>
        <article className="shield-status-card">
          <LockKeyhole size={19} aria-hidden="true" />
          <span>Tor</span>
          <strong>{torNames[torStatus]}</strong>
          <small>
            {ru
              ? "Готовность демона не подтверждает маршрут текущей вкладки"
              : "Daemon readiness does not verify the current tab route"}
          </small>
        </article>
        <article className="shield-status-card">
          <Activity size={19} aria-hidden="true" />
          <span>{ru ? "DNS и утечки" : "DNS and leaks"}</span>
          <strong>
            {browser.settings.dnsMode === "secure"
              ? "Secure DNS"
              : ru
                ? "Системный DNS"
                : "System DNS"}
          </strong>
          <small>
            {ru
              ? "IP / DNS / IPv6: не проверено"
              : "IP / DNS / IPv6: not tested"}
          </small>
        </article>
      </div>
      <div
        className="shield-mode-grid"
        aria-label={ru ? "Выбор режима приватности" : "Choose privacy mode"}
      >
        {cards.map((card) => (
          <button
            type="button"
            className="shield-mode-card"
            aria-pressed={level === card.level}
            key={card.level}
            disabled={busy}
            onClick={() => {
              setPending(card.level);
              setNotice("");
            }}
          >
            <card.icon size={24} aria-hidden="true" />
            <strong>{names[card.level]}</strong>
            <span>{card.body}</span>
          </button>
        ))}
      </div>
      {pending && (
        <div
          className="shield-mode-confirm"
          role="region"
          aria-label={ru ? "Подтверждение режима" : "Confirm privacy mode"}
        >
          <strong>{names[pending]}</strong>
          <p>
            {ru
              ? "Сначала сохраните формы. Применение закроет контексты открытых страниц и соединения, сбросит ручные переопределения режима и включит блокировщик. Исключения сайтов сохранятся. Сетевой маршрут и профиль не меняются автоматически."
              : "Save forms first. Applying closes page contexts and connections, resets manual mode overrides and enables the blocker. Site exceptions are retained. Network route and profile do not change automatically."}
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void applyMode()}
            >
              {ru ? "Применить режим" : "Apply mode"}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => setPending(undefined)}
            >
              {ru ? "Отмена" : "Cancel"}
            </button>
          </div>
        </div>
      )}
      <div className="shield-overview-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void inspect()}
        >
          {busy
            ? ru
              ? "Проверка…"
              : "Checking…"
            : ru
              ? "Проверить конфигурацию"
              : "Check configuration"}
        </button>
        <button className="button" onClick={() => onOpen("tor")}>
          {ru ? "Настроить маршрут Tor" : "Configure Tor route"}
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button className="button" onClick={() => onOpen("general")}>
          {ru ? "Подробная диагностика" : "Detailed diagnostics"}
        </button>
      </div>
      <div className="shield-diagnostic-status" role="status">
        {notice && <p>{notice}</p>}
        {audit ? (
          <>
            <strong>
              {diagnosticPassed
                ? ru
                  ? "Проверенные параметры конфигурации в норме"
                  : "Checked configuration flags passed"
                : ru
                  ? "Обнаружена проблема конфигурации"
                  : "Configuration issue found"}
            </strong>
            <p>
              {ru ? "Последняя локальная диагностика" : "Last local diagnostic"}
              :{" "}
              {new Date(audit.capturedAt).toLocaleString(
                browser.settings.locale,
              )}
            </p>
            <small>
              {ru
                ? "Проверены параметры создания открытых страниц и известные опасные флаги. Это не проверка сетевых утечек, эксплуатации или полной анонимности."
                : "Checked open-page creation options and known unsafe flags. This does not test network leaks, exploitation or complete anonymity."}
            </small>
          </>
        ) : (
          <p>
            {ru
              ? "Диагностика ещё не запускалась. Отсутствие предупреждений не означает, что утечек нет."
              : "Diagnostics have not run yet. No warnings does not mean there are no leaks."}
          </p>
        )}
      </div>
    </section>
  );
}
