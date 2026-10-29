import { useState } from "react";
import type { SecurityAudit } from "../shared/security-center";
import { send } from "./store";

export function PrivacyProof({ locale }: { locale: "ru" | "en" }) {
  const ru = locale === "ru";
  const [report, setReport] = useState<{
    capturedAt: number;
    checks: { name: string; status: string; method: string }[];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function inspect() {
    setBusy(true);
    setError(false);
    try {
      const result = await send({ type: "security.audit" });
      if (!result.ok) {
        setError(true);
        return;
      }
      const audit = result.data as SecurityAudit;
      const measured = (name: string, passed: boolean) => ({
        name,
        status: passed ? "Passed" : "Failed",
        method: ru
          ? "Параметры создания открытых WebContents и известные флаги запуска; не проверка эксплуатации"
          : "Open WebContents creation options and known launch flags; not an exploit test",
      });
      setReport({
        capturedAt: audit.capturedAt,
        checks: [
          measured(
            "Sandbox",
            audit.pages.length > 0 &&
              audit.pages.every((page) => page.sandbox) &&
              !audit.unsafeFlags.sandbox,
          ),
          measured(
            "Context isolation / Node.js",
            audit.pages.length > 0 &&
              audit.pages.every(
                (page) => page.contextIsolation && !page.nodeIntegration,
              ),
          ),
          measured(
            "Web security / TLS flags",
            audit.pages.every((page) => page.webSecurity) &&
              !audit.unsafeFlags.webSecurity &&
              !audit.unsafeFlags.tls,
          ),
          {
            name: ru ? "Системное хранилище секретов" : "OS secret storage",
            status: audit.protectedStorageAvailable ? "Passed" : "Warning",
            method: ru
              ? "Доступность системного API; не аудит шифрования всех данных профиля"
              : "OS API availability; not an audit of all profile encryption",
          },
          ...[
            "DNS",
            "WebRTC / UDP",
            "IPv6",
            "Fingerprinting",
            "Cookie / Storage isolation",
          ].map((name) => ({
            name,
            status: "Not Tested",
            method: ru
              ? "Этот запуск не выполняет сетевой захват, сравнение отпечатков или межсайтовую проверку хранилищ"
              : "This run does not capture packets, compare fingerprints or probe cross-site storage",
          })),
        ],
      });
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "rain-privacy-proof.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="section" aria-label="Privacy Proof Center">
      <h3>Privacy Proof Center</h3>
      <p className="hint">
        {ru
          ? "Локальная диагностика конфигурации без внешних запросов. Passed подтверждает только указанный метод и не гарантирует анонимность. Сетевые утечки требуют отдельной проверки."
          : "Local configuration diagnostics without external requests. Passed confirms only the stated method and does not guarantee anonymity. Network leaks need separate verification."}
      </p>
      <div className="button-row">
        <button
          className="button"
          disabled={busy}
          onClick={() => void inspect()}
        >
          {ru
            ? "Проверить локальную конфигурацию"
            : "Check local configuration"}
        </button>
        <button className="button" disabled={!report} onClick={save}>
          {ru ? "Экспорт диагностики JSON" : "Export diagnostics JSON"}
        </button>
      </div>
      {error && (
        <p role="alert">
          {ru ? "Диагностика не выполнена" : "Diagnostics failed"}
        </p>
      )}
      {report && (
        <>
          <p>{new Date(report.capturedAt).toLocaleString(locale)}</p>
          {report.checks.map((check) => (
            <div className="list-row" key={check.name}>
              <span className="list-main">
                <strong>
                  {check.name}: {check.status}
                </strong>
                <small>{check.method}</small>
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
