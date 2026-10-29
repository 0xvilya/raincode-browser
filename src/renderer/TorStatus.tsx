import { useState } from "react";
import { Shield } from "lucide-react";
import type { Command, TorState } from "../shared/contracts";
import { send } from "./store";
import { torText } from "./tor-i18n";

export function TorStatus({
  tor,
  locale,
  warning,
}: {
  tor?: TorState;
  locale: "ru" | "en";
  warning: string;
}) {
  const [busy, setBusy] = useState(false);
  const t = (key: Parameters<typeof torText>[1]) => torText(locale, key);
  const active = tor?.status === "ready";
  const running = tor && !["stopped", "error"].includes(tor.status);
  const act = async (
    type: Extract<Command, { type: `tor.${string}` }>["type"],
  ) => {
    setBusy(true);
    try {
      await send({ type });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="warning card">
        <Shield size={25} aria-hidden="true" />
        <p>{warning}</p>
      </div>
      <section className="card section" aria-label={t("title")}>
        <p className="hint">{t("vpnNotice")}</p>
        <h2>{t("title")}</h2>
        <p>{t("subtitle")}</p>
        {!tor?.bundled ? (
          <p className="hint">{t("unavailable")}</p>
        ) : (
          <>
            <div role="status" aria-live="polite">
              <strong>{t(tor.status)}</strong>
              {tor.message && <p>{tor.message}</p>}
            </div>
            {running && (
              <progress
                aria-label={t("bootstrap")}
                max={100}
                value={tor.progress}
              />
            )}
            {tor.error && <p role="alert">{tor.error}</p>}
            {tor.phase && (
              <p className="mono">
                {t("phase")}: {tor.phase} · {tor.progress}%
              </p>
            )}
            {tor.reason && (
              <p className="mono">
                {t("reason")}: {tor.reason} ({tor.problems ?? 0})
              </p>
            )}
            {running && <p className="hint">{t("waitHelp")}</p>}
            {tor.status === "error" && (
              <p className="hint">{t("timeoutHelp")}</p>
            )}
            <p className="hint">
              {t("version")}: {tor.version}
            </p>
            <div className="page-actions">
              <button
                className="button"
                disabled={busy || !!running}
                onClick={() => void act("tor.start")}
              >
                {t("start")}
              </button>
              <button
                className="button"
                disabled={busy || !running}
                onClick={() => void act("tor.stop")}
              >
                {t("stop")}
              </button>
              <button
                className="button"
                disabled={busy || !active}
                onClick={() => void act("tor.circuit")}
              >
                {t("circuit")}
              </button>
              <button
                className="button"
                disabled={busy || !active}
                onClick={() => void act("tor.identity")}
              >
                {t("identity")}
              </button>
              <button
                className="button"
                disabled={busy || !!running}
                onClick={() => void act("tor.clear")}
              >
                {t("clear")}
              </button>
            </div>
            <p>{t("isolated")}</p>
            <p className="hint">{t("identityHelp")}</p>
          </>
        )}
      </section>
    </>
  );
}
