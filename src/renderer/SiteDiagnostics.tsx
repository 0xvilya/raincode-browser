import { useEffect, useRef, useState } from "react";
import type { SiteDiagnostics } from "../shared/site-diagnostics";
import { send } from "./store";
import { diagnosticsText } from "./site-diagnostics-i18n";
import "./site-diagnostics.css";

export function SiteDiagnosticsPanel({
  tabId,
  locale,
}: {
  tabId?: string;
  locale: "ru" | "en";
}) {
  const t = (key: Parameters<typeof diagnosticsText>[1]) =>
    diagnosticsText(locale, key);
  const [result, setResult] = useState<SiteDiagnostics>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResult(undefined);
    setError(false);
    setBusy(false);
  }, [tabId]);
  async function inspect(registration: boolean) {
    if (!tabId || busy) return;
    const current = ++generation.current;
    setBusy(true);
    setError(false);
    try {
      const response = await send({
        type: "dev.diagnostics",
        tabId,
        registration,
      });
      if (generation.current !== current) return;
      if (response.ok && response.data)
        setResult(response.data as SiteDiagnostics);
      else setError(true);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  return (
    <section className="site-diagnostics card" aria-label={t("title")}>
      <h3>{t("title")}</h3>
      <p className="hint">{t("hint")}</p>
      <div className="button-row">
        <button
          className="button"
          onClick={() => void inspect(false)}
          disabled={!tabId || busy}
        >
          {busy ? t("busy") : t("inspect")}
        </button>
        <button
          className="button"
          onClick={() => void inspect(true)}
          disabled={!tabId || busy || result?.status !== "resolved"}
        >
          {t("lookup")}
        </button>
      </div>
      <p className="hint">{t("disclosure")}</p>
      {!tabId && <p>{t("empty")}</p>}
      {error && <p role="status">{t("error")}</p>}
      {result && (
        <div role="status" aria-live="polite">
          <dl>
            <dt>{t("hostname")}</dt>
            <dd>{result.hostname}</dd>
            {result.status === "resolved" && (
              <>
                <dt>{t("addresses")}</dt>
                <dd>{result.addresses.join(", ")}</dd>
              </>
            )}
          </dl>
          {result.status !== "resolved" && <p>{t(result.status)}</p>}
          {result.registrationStatus === "unavailable" && (
            <p>{t("unavailable")}</p>
          )}
          {result.registrationStatus === "private-address" && (
            <p>{t("privateAddress")}</p>
          )}
          {result.network && (
            <dl>
              <dt>{t("provider")}</dt>
              <dd>{result.network.provider}</dd>
              <dt>{t("prefix")}</dt>
              <dd>{result.network.prefix || t("unknown")}</dd>
              <dt>{t("asns")}</dt>
              <dd>
                {result.network.asns.map((asn) => `AS${asn}`).join(", ") ||
                  t("unknown")}
              </dd>
              <dt>{t("holder")}</dt>
              <dd>{result.network.holder || t("unknown")}</dd>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
