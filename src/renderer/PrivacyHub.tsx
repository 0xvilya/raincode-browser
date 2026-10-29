import { useRef, useState, useEffect, type ReactNode } from "react";
import "./privacy-hub.css";
import { ShieldOverview } from "./ShieldOverview";
import {
  Shield,
  Search,
  Network,
  Fingerprint,
  Users,
  Database,
  Bot,
  ScanLine,
  Settings2,
  LayoutDashboard,
} from "lucide-react";
import type { BrowserState, PrivacySection } from "../shared/contracts";

const labels = {
  ru: {
    title: "Центр конфиденциальности и безопасности",
    fingerprint:
      "Блокировка JavaScript уменьшает доступ к API страницы, но не унифицирует цифровой отпечаток. Canvas, WebGL, Audio и характеристики устройства не объявляются защищёнными. Строгий/максимальный режим и Tor удаляют подробные Client Hints из HTTP. Tor ограничивает WebRTC; это не эквивалент защиты Tor Browser",
    dnsHint:
      "Эта настройка задаёт резолвер Chromium; разрешение имён через прокси зависит от его типа. Tor разрешает имена через SOCKS, адреса .onion не передаются обычному DNS. Системный DNS и трафик других приложений не контролируются браузером",
    intro:
      "Все настройки защиты в одном месте — изменения применяются только вашим действием",
    general: "Общая конфиденциальность и диагностика",
    monitor: "Монитор сети",
    protection: "Защита от отслеживания и цифрового отпечатка",
    sites: "Пароли, cookies, данные сайтов и приватный режим",
    security: "Разрешения сайтов, доступ ИИ и аудит безопасности",
    tor: "Tor и Onion",
    network: "Сетевая безопасность и изоляция профилей",
    dns: "DNS и защита от утечек",
    ai: "Конфиденциальность ИИ",
  },
  en: {
    title: "Privacy and security center",
    fingerprint:
      "Disabling JavaScript reduces page API access but does not standardize the browser fingerprint. Canvas, WebGL, Audio and device characteristics are not claimed protected. Strict/maximum and Tor strip detailed HTTP Client Hints. Tor restricts WebRTC; this is not Tor Browser parity",
    dnsHint:
      "This sets the Chromium resolver; proxy name resolution depends on the proxy type. Tor resolves names through SOCKS; onion addresses are not sent to ordinary DNS. System DNS and other applications are outside the browser control",
    intro: "Protection controls in one place — changes require your action",
    general: "General privacy and diagnostics",
    monitor: "Network monitor",
    protection: "Tracking and fingerprint protection",
    sites: "Passwords, cookies, site data and private browsing",
    security: "Site permissions, AI access and security audit",
    tor: "Tor and Onion",
    network: "Network security and profile isolation",
    dns: "DNS and leak protection",
    ai: "AI privacy",
  },
};

export const privacyHubText = (
  locale: "ru" | "en",
  key: keyof typeof labels.en,
) => labels[locale][key];

const groups = [
  {
    id: "overview",
    ru: "Обзор",
    en: "Overview",
    icon: LayoutDashboard,
    sections: [],
  },
  {
    id: "route",
    ru: "Сеть и Tor",
    en: "Network and Tor",
    icon: Network,
    sections: ["tor", "dns"],
  },
  {
    id: "tracking",
    ru: "Защита от отслеживания",
    en: "Tracking protection",
    icon: Fingerprint,
    sections: ["protection", "monitor"],
  },
  {
    id: "identities",
    ru: "Изоляция и личности",
    en: "Isolation and identities",
    icon: Users,
    sections: ["network"],
  },
  {
    id: "data",
    ru: "Данные и приватные сессии",
    en: "Data and private sessions",
    icon: Database,
    sections: ["sites"],
  },
  {
    id: "ai",
    ru: "Конфиденциальность ИИ",
    en: "AI privacy",
    icon: Bot,
    sections: ["ai"],
  },
  {
    id: "diagnostics",
    ru: "Диагностика",
    en: "Diagnostics",
    icon: ScanLine,
    sections: ["general"],
  },
  {
    id: "advanced",
    ru: "Расширенные настройки",
    en: "Advanced settings",
    icon: Settings2,
    sections: ["security"],
  },
];
const groupFor = (section: PrivacySection) =>
  groups.find((g) => g.sections.includes(section))?.id || "overview";
export function PrivacyHub({
  locale,
  browser,
  sections,
  initialSection = "general",
}: {
  locale: "ru" | "en";
  browser: BrowserState;
  initialSection?: PrivacySection;
  sections: (
    open: (section: PrivacySection) => void,
  ) => Record<PrivacySection, ReactNode>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(
    initialSection === "general" ? "overview" : groupFor(initialSection),
  );
  const [query, setQuery] = useState("");
  const t = labels[locale];
  const ru = locale === "ru";
  useEffect(() => {
    setSelected(
      initialSection === "general" ? "overview" : groupFor(initialSection),
    );
    setQuery("");
  }, [initialSection]);
  function open(section: PrivacySection) {
    setSelected(groupFor(section));
    setQuery("");
    requestAnimationFrame(() => {
      const panel = root.current?.querySelector<HTMLElement>(
        '[data-privacy-section="' + section + '"]',
      );
      panel?.scrollIntoView({ block: "start", behavior: "instant" });
      panel?.focus();
    });
  }
  const content = sections(open);
  const matches = (Object.keys(content) as PrivacySection[]).filter((key) => {
    const text =
      root.current?.querySelector('[data-privacy-section="' + key + '"]')
        ?.textContent || "";
    return (t[key] + " " + labels.en[key] + " " + labels.ru[key] + " " + text)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
  });
  return (
    <div className="privacy-hub shield-v2" ref={root}>
      <header className="shield-header">
        <div className="shield-brand">
          <Shield size={30} />
          <div>
            <span className="shield-eyebrow">RAIN SHIELD 2.0</span>
            <h2>RAIN SHIELD</h2>
            <p>
              {ru
                ? "Ваш центр конфиденциальности и безопасности"
                : "Your privacy and security center"}
            </p>
          </div>
        </div>
        <label className="shield-search">
          <Search size={17} />
          <input
            type="search"
            aria-label={
              ru ? "Поиск по настройкам щита" : "Search Shield settings"
            }
            placeholder={ru ? "Найти настройку…" : "Find a setting…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>
      <div className="shield-layout">
        <nav
          className="shield-tabs"
          role="tablist"
          aria-label="Rain Shield"
          aria-orientation="vertical"
        >
          {groups.map((g, i) => (
            <button
              role="tab"
              key={g.id}
              id={"shield-tab-" + g.id}
              aria-controls={"shield-panel-" + g.id}
              aria-selected={selected === g.id}
              tabIndex={selected === g.id ? 0 : -1}
              onClick={() => {
                setSelected(g.id);
                setQuery("");
              }}
              onKeyDown={(e) => {
                let index = i;
                if (e.key === "ArrowDown" || e.key === "ArrowRight")
                  index = (i + 1) % groups.length;
                else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
                  index = (i + groups.length - 1) % groups.length;
                else if (e.key === "Home") index = 0;
                else if (e.key === "End") index = groups.length - 1;
                else return;
                e.preventDefault();
                setSelected(groups[index].id);
                setQuery("");
                root.current
                  ?.querySelector<HTMLButtonElement>(
                    "#shield-tab-" + groups[index].id,
                  )
                  ?.focus();
              }}
            >
              <g.icon size={17} />
              <span>{ru ? g.ru : g.en}</span>
            </button>
          ))}
        </nav>
        <main className="shield-main">
          {query && (
            <section className="shield-results" aria-live="polite">
              <h3>{ru ? "Результаты поиска" : "Search results"}</h3>
              {matches.length ? (
                matches.map((key) => (
                  <button
                    className="shield-result"
                    aria-label={t[key]}
                    key={key}
                    onClick={() => open(key)}
                  >
                    {t[key]} <span>→</span>
                  </button>
                ))
              ) : (
                <p>{ru ? "Настройки не найдены" : "No matching settings"}</p>
              )}
            </section>
          )}
          {groups.map((g) => (
            <div
              key={g.id}
              role="tabpanel"
              id={"shield-panel-" + g.id}
              aria-labelledby={"shield-tab-" + g.id}
              hidden={selected !== g.id || !!query}
            >
              {g.id === "overview" && (
                <ShieldOverview browser={browser} onOpen={open} />
              )}
              {g.sections.map((key) => (
                <section
                  className="privacy-hub-section"
                  data-privacy-section={key}
                  key={key}
                  tabIndex={-1}
                >
                  <header>
                    <h3>{t[key as PrivacySection]}</h3>
                  </header>
                  <div className="privacy-hub-content">
                    {content[key as PrivacySection]}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
