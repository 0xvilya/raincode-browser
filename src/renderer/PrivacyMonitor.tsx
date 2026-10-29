import { useEffect, useState } from "react";
import type { BrowserState } from "../shared/contracts";
import type { MonitorEntry } from "../main/privacy-monitor";
import { send } from "./store";

const text = {
  ru: {
    title: "Монитор сети",
    hint: "Включается только по вашему действию для одной открытой вкладки и её текущего источника. Хранит в памяти не более 200 групп: только домен, тип и решение; без адресов страниц, параметров, заголовков и содержимого. Остановка, закрытие вкладки, смена профиля или переход на другой источник очищают данные. Наблюдение за отдельной вкладкой не обнаруживает все утечки ОС.",
    select: "Вкладка для мониторинга",
    none: "Откройте веб-страницу в другой вкладке этого профиля",
    start: "Начать мониторинг",
    stop: "Остановить и очистить",
    refresh: "Обновить результаты",
    active: "Мониторинг включён",
    inactive: "Мониторинг выключен",
    search: "Поиск по домену или типу ресурса",
    requests: "Наблюдаемые запросы",
    trackers: "Заблокированные трекеры",
    domains: "Сторонние домены",
    observed: "Запрос замечен",
    tracker: "Заблокирован трекер",
    blocked: "Запрос заблокирован",
    redirected: "Запрос перенаправлен",
    cross: "Другой origin",
    same: "Тот же origin",
    failed:
      "Не удалось запустить мониторинг. Убедитесь, что вкладка открыта и загружена.",
    unknown:
      "Видны только запросы, привязанные движком к этой вкладке; часть фоновых запросов и workers может отсутствовать. Состояние VPN и утечки ОС здесь не проверяются. Tor, DNS и WebRTC описаны в других разделах щита.",
  },
  en: {
    title: "Network monitor",
    hint: "Starts only when requested for one open tab and its current origin. Holds up to 200 groups in memory: host, type and decision only; no page URLs, parameters, headers or bodies. Stopping, closing the tab, changing profile or navigating to another origin clears the data. Per-tab observation cannot detect every OS leak.",
    select: "Tab to monitor",
    none: "Open a web page in another tab of this profile",
    start: "Start monitoring",
    stop: "Stop and clear",
    refresh: "Refresh results",
    active: "Monitoring active",
    inactive: "Monitoring off",
    search: "Search domain or resource type",
    requests: "Observed requests",
    trackers: "Blocked trackers",
    domains: "Third-party domains",
    observed: "Request observed",
    tracker: "Tracker blocked",
    blocked: "Request blocked",
    redirected: "Request redirected",
    cross: "Cross-origin",
    same: "Same origin",
    failed: "Could not start monitoring. Make sure the tab is open and loaded.",
    unknown:
      "Only requests attributed by the engine to this tab are shown; some worker and background requests may be missing. VPN status and OS leaks are not checked here. Tor, DNS and WebRTC are described in other shield sections.",
  },
};
type Snapshot = { active: boolean; tabId?: string; records: MonitorEntry[] };
export function PrivacyMonitorPanel({ browser }: { browser: BrowserState }) {
  const t = text[browser.settings.locale];
  const current = browser.tabs.find((tab) => tab.id === browser.activeTabId);
  const candidates = browser.tabs.filter(
    (tab) =>
      tab.profileId === current?.profileId &&
      /^https?:\/\//.test(tab.url) &&
      !tab.suspended,
  );
  const [target, setTarget] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    active: false,
    records: [],
  });
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  async function refresh() {
    const result = await send({ type: "privacy.monitor.snapshot" });
    if (result.ok) setSnapshot(result.data as Snapshot);
  }
  useEffect(() => {
    void refresh();
  }, [browser.privacyMonitorTabId, current?.profileId]);
  const active = Boolean(browser.privacyMonitorTabId);
  return (
    <section className="card section" aria-label={t.title}>
      <h2>{t.title}</h2>
      <p className="hint">{t.hint}</p>
      <p className="hint">{t.unknown}</p>
      <label className="field">
        {t.select}
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">{t.none}</option>
          {candidates.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.title}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <button
          className="button"
          disabled={!candidates.some((tab) => tab.id === target)}
          onClick={async () => {
            const result = await send({
              type: "privacy.monitor.start",
              tabId: target,
            });
            setError(!result.ok);
            if (result.ok) setSnapshot(result.data as Snapshot);
          }}
        >
          {t.start}
        </button>
        <button
          className="button"
          disabled={!active}
          onClick={async () => {
            await send({ type: "privacy.monitor.stop" });
            setSnapshot({ active: false, records: [] });
          }}
        >
          {t.stop}
        </button>
        <button
          className="button"
          disabled={!active}
          onClick={() => void refresh()}
        >
          {t.refresh}
        </button>
      </div>
      <p role="status">{active ? t.active : t.inactive}</p>
      <dl className="privacy-radar-stats">
        <div>
          <dt>{t.requests}</dt>
          <dd>
            {snapshot.records.reduce((total, entry) => total + entry.count, 0)}
          </dd>
        </div>
        <div>
          <dt>{t.trackers}</dt>
          <dd>
            {snapshot.records
              .filter((entry) => entry.action === "tracker")
              .reduce((total, entry) => total + entry.count, 0)}
          </dd>
        </div>
        <div>
          <dt>{t.domains}</dt>
          <dd>
            {
              new Set(
                snapshot.records
                  .filter((entry) => entry.crossOrigin)
                  .map((entry) => entry.host),
              ).size
            }
          </dd>
        </div>
      </dl>
      <label className="field">
        {t.search}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {error && <p role="alert">{t.failed}</p>}
      {snapshot.active &&
        snapshot.records
          .filter((entry) =>
            `${entry.host} ${entry.resourceType}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
          )
          .map((entry, index) => (
            <div
              className="list-row"
              key={`${entry.host}:${entry.resourceType}:${entry.action}:${index}`}
            >
              <span className="list-main">
                <strong>{entry.host}</strong>
                <small>
                  {t[entry.action]} · {entry.resourceType} ·{" "}
                  {entry.crossOrigin ? t.cross : t.same}
                </small>
              </span>
              <span>{entry.count}</span>
            </div>
          ))}
    </section>
  );
}
