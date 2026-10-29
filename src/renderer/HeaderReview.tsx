import { useState, useEffect, useRef } from "react";
import type { BrowserState } from "../shared/contracts";
import type { reviewHeaders } from "../main/header-review";
import { send, useBrowser } from "./store";
import { headerFindingText, headerLimitationText } from "./header-review-i18n";
import {
  formatHeaderReport,
  type SecurityReportFormat,
} from "../shared/security-report";

type Snapshot = {
  active: boolean;
  tabId?: string;
  report?: ReturnType<typeof reviewHeaders>;
};
export function HeaderReview({ browser }: { browser: BrowserState }) {
  const ru = browser.settings.locale === "ru";
  const profile = browser.tabs.find(
    (tab) => tab.id === browser.activeTabId,
  )?.profileId;
  const tabs = browser.tabs.filter(
    (tab) =>
      tab.profileId === profile && /^https?:/.test(tab.url) && !tab.suspended,
  );
  const [target, setTarget] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>({ active: false });
  const [error, setError] = useState(false);
  const [format, setFormat] = useState<SecurityReportFormat>("json");
  const [cookies, setCookies] = useState<{
    origin: string;
    total: number;
    withoutSecure: number;
    withoutHttpOnly: number;
    unrestrictedSameSite: number;
  }>();
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current++;
    setSnapshot({ active: false });
    setTarget("");
    setCookies(undefined);
  }, [profile]);
  const valid =
    !snapshot.tabId ||
    tabs.some(
      (tab) =>
        tab.id === snapshot.tabId &&
        (!snapshot.report ||
          new URL(tab.url).origin === snapshot.report.origin),
    );
  const report = valid ? snapshot.report : undefined;
  async function run(action: "start" | "read" | "stop") {
    const generation = epoch.current;
    const response = await send({
      type: "security.headers",
      action,
      ...(action === "start" ? { tabId: target } : {}),
    });
    if (generation !== epoch.current) return;
    setError(!response.ok);
    if (response.ok) setSnapshot(response.data as Snapshot);
  }
  function download() {
    if (!report) return;
    const exportFile = formatHeaderReport(report, format);
    const url = URL.createObjectURL(
      new Blob([exportFile.content], {
        type: exportFile.mime,
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `rain-header-review.${exportFile.extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="section"
      aria-label={ru ? "Анализ заголовков сайта" : "Website header review"}
    >
      <h3>
        {ru
          ? "Пассивный анализ заголовков сайта"
          : "Passive website header review"}
      </h3>
      <p className="hint">
        {ru
          ? "Выберите вкладку и включите анализ. Затем самостоятельно перезагрузите её и обновите результаты здесь. Анализ не отправляет дополнительных запросов и не перезагружает страницу. Отчёт содержит только origin и выводы без значений заголовков. Это ограниченная проверка конфигурации, а не доказательство уязвимости или полного состояния TLS."
          : "Select a tab and enable review. Reload it yourself, then refresh results here. Review sends no extra requests and does not reload the page. Reports contain only the origin and findings, without header values. This is a limited configuration check, not proof of a vulnerability or a complete TLS assessment."}
      </p>
      <label className="field">
        {ru ? "Проверяемая вкладка" : "Reviewed tab"}
        <select
          value={target}
          aria-label={ru ? "Проверяемая вкладка" : "Reviewed tab"}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">{ru ? "Выберите вкладку" : "Select a tab"}</option>
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.title}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <button
          className="button"
          disabled={!tabs.some((tab) => tab.id === target)}
          onClick={async () => {
            const generation = epoch.current;
            const result = await send({
              type: "security.cookies",
              tabId: target,
            });
            if (generation !== epoch.current) return;
            setError(!result.ok);
            if (result.ok)
              setCookies(result.data as NonNullable<typeof cookies>);
          }}
        >
          {ru ? "Проверить атрибуты cookies" : "Inspect cookie attributes"}
        </button>
        <button
          className="button"
          disabled={!tabs.some((tab) => tab.id === target)}
          onClick={() => void run("start")}
        >
          {ru ? "Включить анализ заголовков" : "Enable header review"}
        </button>
        <button className="button" onClick={() => void run("read")}>
          {ru ? "Обновить анализ заголовков" : "Refresh header review"}
        </button>
        <button className="button" onClick={() => void run("stop")}>
          {ru ? "Остановить и очистить анализ" : "Stop and clear review"}
        </button>
        <label className="field">
          {ru ? "Формат отчёта" : "Report format"}
          <select
            value={format}
            aria-label={ru ? "Формат отчёта" : "Report format"}
            onChange={(event) =>
              setFormat(event.target.value as SecurityReportFormat)
            }
          >
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
            <option value="sarif">SARIF</option>
          </select>
        </label>
        <button className="button" disabled={!report} onClick={download}>
          {ru
            ? `Сохранить отчёт ${format.toUpperCase()}`
            : `Save ${format.toUpperCase()} report`}
        </button>
        <button
          className="button"
          disabled={!report || !browser.settings.aiEnabled}
          onClick={() => {
            if (!report || !profile) return;
            useBrowser.getState().setAiReviewDraft({
              profileId: profile,
              text: `${ru ? "Объясни результаты пассивной проверки. Предупреждения не являются доказанными уязвимостями. Предложи защитные исправления, ничего не выполняй." : "Explain this passive review. Warnings are not confirmed vulnerabilities. Suggest defensive fixes without executing anything."}\n${JSON.stringify(report, null, 2)}`,
            });
            window.dispatchEvent(new Event("raincode-open-ai"));
          }}
        >
          {ru
            ? "Объяснить через ИИ — подготовить черновик"
            : "Explain with AI — prepare draft"}
        </button>
      </div>
      <p role="status">
        {error
          ? ru
            ? "Не удалось выполнить проверку"
            : "Review failed"
          : snapshot.active && valid
            ? ru
              ? "Анализ включён для выбранного origin"
              : "Review enabled for selected origin"
            : ru
              ? "Анализ выключен"
              : "Review off"}
      </p>
      {report && (
        <>
          <strong>{report.origin}</strong>
          {report.findings.map((finding) => (
            <p key={finding.rule}>
              {finding.status === "passed" ? "✓" : "⚠"} {finding.rule}:{" "}
              {headerFindingText(
                browser.settings.locale,
                finding.rule,
                finding.detail,
              )}
            </p>
          ))}
          <p className="hint">
            {headerLimitationText(browser.settings.locale, report.limitation)}
          </p>
        </>
      )}
      {cookies &&
        tabs.some((tab) => new URL(tab.url).origin === cookies.origin) && (
          <div
            role="region"
            aria-label={ru ? "Атрибуты cookies" : "Cookie attributes"}
          >
            <strong>{cookies.origin}</strong>
            <p>
              {ru ? "Cookies для корневого URL" : "Cookies for root URL"}:{" "}
              {cookies.total} · Secure: {cookies.total - cookies.withoutSecure}{" "}
              · HttpOnly: {cookies.total - cookies.withoutHttpOnly} · SameSite
              None/unspecified: {cookies.unrestrictedSameSite}
            </p>
            <p className="hint">
              {ru
                ? "Значения и имена не передаются интерфейсу или ИИ. Отсутствие атрибута не доказывает уязвимость: назначение cookie неизвестно. Cookies с другими ограничениями Path могут не входить в выборку."
                : "Values and names are not sent to the UI or AI. Missing attributes do not prove a vulnerability: cookie purpose is unknown. Cookies scoped to other paths may be outside this sample."}
            </p>
            <button className="button" onClick={() => setCookies(undefined)}>
              {ru ? "Очистить результат cookies" : "Clear cookie result"}
            </button>
          </div>
        )}
    </section>
  );
}
