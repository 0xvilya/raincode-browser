import { useEffect, useState } from "react";
import { reviewCode, type CodeReview as Review } from "../shared/code-review";
import type { BrowserState } from "../shared/contracts";
import { send, useBrowser } from "./store";

export function CodeReview({ browser }: { browser: BrowserState }) {
  const ru = browser.settings.locale === "ru";
  const profileId = browser.tabs.find(
    (t) => t.id === browser.activeTabId,
  )?.profileId;
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Review>();
  const [error, setError] = useState(false);
  const [handoff, setHandoff] = useState("");
  useEffect(() => {
    setSource("");
    setReport(undefined);
    setError(false);
    setHandoff("");
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
            setHandoff("");
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
            setHandoff("");
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
            useBrowser.getState().setAiReviewDraft({
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
      <section aria-label="RainCode + Nexus">
        <p className="hint">
          {ru
            ? "Nexus создаёт файлы и помогает исправлять проекты с локальными моделями. Перенесите результаты проверки в Nexus → Код → RainCode + Nexus."
            : "Nexus creates files and helps repair projects with local models. Bring these findings into Nexus → Code → RainCode + Nexus."}
        </p>
        <div className="button-row">
          <button
            className="button"
            disabled={!report}
            onClick={() => {
              if (!report) return;
              setHandoff(
                JSON.stringify(
                  {
                    format: "rainforge.handoff.v1",
                    source: "raincode",
                    task: ru
                      ? "Объясни находки проверки и предложи исправления. Сначала запроси необходимые исходные файлы."
                      : "Explain the review findings and suggest fixes. First ask for any necessary source files.",
                    context: JSON.stringify(report).slice(0, 3000),
                  },
                  null,
                  2,
                ),
              );
            }}
          >
            {ru ? "Подготовить пакет для Nexus" : "Prepare Nexus handoff"}
          </button>
          <button
            className="button"
            onClick={() =>
              void send({
                type: "tab.create",
                url: "https://0xvilya.github.io/my-projects/",
              })
            }
          >
            {ru ? "Проекты RainForge" : "RainForge projects"} ↗
          </button>
        </div>
        {handoff && (
          <label className="field">
            {ru
              ? "Скопируйте пакет в Nexus. Исходный код не включён."
              : "Copy this packet into Nexus. Source code is excluded."}
            <textarea
              readOnly
              aria-label="Nexus handoff packet"
              rows={8}
              value={handoff}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        )}
      </section>
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
