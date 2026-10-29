import { useEffect, useState } from "react";
import { reviewCode, type CodeReview as Review } from "../shared/code-review";
import type { BrowserState } from "../shared/contracts";
import { useBrowser } from "./store";

export function CodeReview({ browser }: { browser: BrowserState }) {
  const ru = browser.settings.locale === "ru";
  const profileId = browser.tabs.find(
    (t) => t.id === browser.activeTabId,
  )?.profileId;
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Review>();
  const [error, setError] = useState(false);
  useEffect(() => {
    setSource("");
    setReport(undefined);
    setError(false);
  }, [profileId]);
  return (
    <section
      className="section"
      aria-label={ru ? "Локальная проверка кода" : "Local code review"}
    >
      <h3>
        {ru
          ? "Проверка JavaScript и конфигурации"
          : "JavaScript and configuration review"}
      </h3>
      <p className="hint">
        {ru
          ? "Вставьте собственный код (до 256 КиБ). Проверка локальная: код не выполняется, не сохраняется и не отправляется ИИ. Эвристики могут пропускать проблемы или срабатывать в комментариях; находки требуют ручной проверки."
          : "Paste your own code (up to 256 KiB). Analysis is local: code is not executed, saved or sent to AI. Heuristics may miss issues or match comments; findings require manual review."}
      </p>
      <label className="field">
        {ru ? "Исходный код для проверки" : "Source to review"}
        <textarea
          rows={10}
          maxLength={262144}
          value={source}
          spellCheck={false}
          onChange={(e) => {
            setSource(e.target.value);
            setReport(undefined);
            setError(false);
          }}
        />
      </label>
      <div className="button-row">
        <button
          className="button"
          disabled={!source.trim()}
          onClick={() => {
            try {
              setReport(reviewCode(source));
              setError(false);
            } catch {
              setReport(undefined);
              setError(true);
            }
          }}
        >
          {ru ? "Проверить код локально" : "Review code locally"}
        </button>
        <button
          className="button"
          onClick={() => {
            setSource("");
            setReport(undefined);
            setError(false);
          }}
        >
          {ru ? "Очистить код и результаты" : "Clear code and results"}
        </button>
        <button
          className="button"
          disabled={!report || !browser.settings.aiEnabled}
          onClick={() => {
            if (!report || !profileId) return;
            useBrowser
              .getState()
              .setAiReviewDraft({
                profileId,
                text: `${ru ? "Объясни эвристические находки. Исходный код не приложен, уязвимости не подтверждены. Не выполняй действий." : "Explain these heuristic findings. Source is not included; vulnerabilities are not confirmed. Do not execute actions."}\n${JSON.stringify(report, null, 2)}`,
              });
            window.dispatchEvent(new Event("raincode-open-ai"));
          }}
        >
          {ru
            ? "Объяснить находки — черновик ИИ"
            : "Explain findings — AI draft"}
        </button>
      </div>
      {error && (
        <p role="alert">
          {ru
            ? "Код превышает допустимый размер или не может быть проверен"
            : "Code exceeds the size limit or cannot be reviewed"}
        </p>
      )}
      {report && (
        <div role="status">
          <p>
            {ru ? "Эвристических находок" : "Heuristic findings"}:{" "}
            {report.findings.length}
          </p>
          {report.findings.map((f, index) => (
            <div className="list-row" key={`${f.rule}-${f.line}-${index}`}>
              <span className="list-main">
                <strong>
                  {f.rule} · {ru ? "строка" : "line"} {f.line} · {f.confidence}
                </strong>
                <small>{f.recommendation}</small>
              </span>
            </div>
          ))}
          <p className="hint">
            {ru
              ? "Отсутствие находок не доказывает безопасность. Указаны номера строк, без содержимого кода или секретов."
              : "No findings does not prove safety. Results contain line numbers, without source or secrets."}
          </p>
          {report.truncated && (
            <p>
              {ru
                ? "Достигнут лимит 200 находок"
                : "The 200-finding limit was reached"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
