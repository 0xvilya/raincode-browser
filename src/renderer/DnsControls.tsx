import { useState } from "react";
import type { Settings } from "../shared/contracts";
import { translate } from "./i18n";
import { send } from "./store";
import { privacyHubText } from "./PrivacyHub";

export function DnsControls({ settings }: { settings: Settings }) {
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(settings.locale, key);
  const [mode, setMode] = useState(settings.dnsMode);
  const [template, setTemplate] = useState(settings.dohTemplate);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const hint = privacyHubText(settings.locale, "dnsHint");
  return (
    <section className="card section" id="settings-dns" aria-label={t("dns")}>
      <h2>{t("dns")}</h2>
      <p className="hint">{hint}</p>
      <label className="setting-row">
        {t("mode")}
        <select
          value={mode}
          disabled={busy}
          onChange={(event) =>
            setMode(event.target.value as Settings["dnsMode"])
          }
        >
          <option value="system">{t("dnsSystem")}</option>
          <option value="secure">{t("dnsSecure")}</option>
        </select>
      </label>
      <label className="field">
        {t("dohTemplate")}
        <input
          value={template}
          disabled={busy}
          onChange={(event) => setTemplate(event.target.value)}
          placeholder="https://…/dns-query{?dns}"
        />
      </label>
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("");
          try {
            const result = await send({
              type: "settings.update",
              settings: { dnsMode: mode, dohTemplate: template },
            });
            setStatus(
              result.ok ? t("operationComplete") : result.error || t("error"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("save")}
      </button>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
