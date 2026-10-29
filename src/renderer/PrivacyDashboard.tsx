import {
  History,
  LockKeyhole,
  Network,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { BrowserState, Command } from "../shared/contracts";
import { dashboardText } from "./privacy-dashboard-i18n";
import "./privacy-dashboard.css";

export function SecurityPrivacyDashboard({
  browser,
  tone,
  command,
  onOpen,
}: {
  browser: BrowserState;
  tone: "privacy" | "security";
  command: (command: Command) => void;
  onOpen?: (page: string) => void;
}) {
  const t = (key: Parameters<typeof dashboardText>[1]) =>
    dashboardText(browser.settings.locale, key);
  const tab = browser.tabs.find((item) => item.id === browser.activeTabId);
  const profile = browser.profiles.find((item) => item.id === tab?.profileId);
  const mode = profile?.mode || "direct";
  const killed = browser.settings.networkKillSwitch;
  const modeHint = {
    direct: "directHint",
    proxy: "proxyHint",
    private: "privateHint",
    tor: "torHint",
  } as const;
  const open = (page: string) =>
    onOpen
      ? onOpen(page)
      : command({ type: "navigate", url: `raincode://${page}` });
  return (
    <div className="privacy-dashboard" data-tone={tone}>
      <header className="pd-header">
        <span className="pd-emblem" aria-hidden="true">
          {tone === "privacy" ? (
            <LockKeyhole size={25} />
          ) : (
            <Shield size={25} />
          )}
        </span>
        <div>
          <h2>{t(tone)}</h2>
          <p>{t(tone === "privacy" ? "privacyIntro" : "securityIntro")}</p>
        </div>
      </header>
      <section className="pd-card" aria-label={t("overview")}>
        <div className="pd-section-title">
          <Network size={18} aria-hidden="true" />
          <h3>{t("overview")}</h3>
        </div>
        <dl className="pd-profile">
          <div>
            <dt>{t("profile")}</dt>
            <dd>{profile?.name || t("direct")}</dd>
          </div>
          <div>
            <dt>{t("connection")}</dt>
            <dd className={`pd-mode pd-mode-${mode}`}>{t(mode)}</dd>
          </div>
        </dl>
        <p>{t(modeHint[mode])}</p>
        <label className={`pd-toggle ${killed ? "pd-killed" : ""}`}>
          <span>
            <strong>{t("kill")}</strong>
            <small>{t("killHint")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t("kill")}
            checked={killed}
            onChange={(event) =>
              command({
                type: "settings.update",
                settings: { networkKillSwitch: event.target.checked },
              })
            }
          />
        </label>
        <p className="pd-state" role="status">
          {t(killed ? "killOn" : "killOff")}
        </p>
        <label className="pd-toggle">
          <span>
            <strong>{t("history")}</strong>
            <small>{t("historyHint")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t("history")}
            checked={browser.settings.historyEnabled}
            onChange={(event) =>
              command({
                type: "settings.update",
                settings: { historyEnabled: event.target.checked },
              })
            }
          />
        </label>
        <p className="pd-state">
          {t(browser.settings.historyEnabled ? "historyOn" : "historyOff")}
        </p>
        <p className="pd-hint">{t("retention")}</p>
      </section>
      <section className="pd-card" aria-label={t("policies")}>
        <div className="pd-section-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <h3>{t("policies")}</h3>
        </div>
        <p>{t("policiesHint")}</p>
        <div className="pd-policy-grid">
          {(["sandbox", "context", "node", "tls"] as const).map((key) => (
            <div className="pd-policy" key={key}>
              <div>
                <strong>{t(key)}</strong>
                <span className="pd-policy-badge">{t("active")}</span>
              </div>
              <p>
                {t(
                  (
                    {
                      sandbox: "sandboxHint",
                      context: "contextHint",
                      node: "nodeHint",
                      tls: "tlsHint",
                    } as const
                  )[key],
                )}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="pd-card" aria-label={t("permissions")}>
        <h3>{t("permissions")}</h3>
        <p>{t("permissionsHint")}</p>
        <div className="pd-permissions">
          {browser.permissions.map((item) => (
            <div
              className="pd-permission"
              key={`${item.profileId}:${item.origin}:${item.permission}`}
            >
              <div className="pd-permission-origin">
                <strong dir="ltr">{item.origin}</strong>
                <small>
                  {browser.profiles.find(
                    (profile) => profile.id === item.profileId,
                  )?.name || item.profileId}{" "}
                  · <code>{item.permission}</code>
                </small>
              </div>
              <span
                className={
                  item.allowed ? "pd-decision-allow" : "pd-decision-deny"
                }
              >
                {t(item.allowed ? "allowed" : "denied")}
              </span>
              <button
                type="button"
                className="button"
                aria-label={`${t("revoke")} ${item.permission} ${item.origin}`}
                onClick={() =>
                  command({
                    type: "permission.revoke",
                    origin: item.origin,
                    permission: item.permission,
                    profileId: item.profileId,
                  })
                }
              >
                {t("revoke")}
              </button>
            </div>
          ))}
          {!browser.permissions.length && (
            <p className="pd-hint">{t("noPermissions")}</p>
          )}
        </div>
      </section>
      <section className="pd-card pd-limits" aria-label={t("limitations")}>
        <h3>{t("limitations")}</h3>
        {(["fingerprint", "google", "vpn", "audit"] as const).map((key) => (
          <div key={key}>
            <strong>{t(key)}</strong>
            <p>
              {t(
                (
                  {
                    fingerprint: "fingerprintHint",
                    google: "googleHint",
                    vpn: "vpnHint",
                    audit: "auditHint",
                  } as const
                )[key],
              )}
            </p>
          </div>
        ))}
      </section>
      <nav className="pd-links" aria-label={t("settings")}>
        <button
          type="button"
          className="button"
          onClick={() => open(tone === "privacy" ? "security" : "privacy")}
        >
          <Shield size={16} aria-hidden="true" />
          {t(tone === "privacy" ? "security" : "privacy")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => open("history")}
        >
          <History size={16} aria-hidden="true" />
          {t("openHistory")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => open("network")}
        >
          <Network size={16} aria-hidden="true" />
          {t("network")}
        </button>
        <button type="button" className="button" onClick={() => open("tor")}>
          <Shield size={16} aria-hidden="true" />
          {t("openTor")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => open("settings")}
        >
          <LockKeyhole size={16} aria-hidden="true" />
          {t("settings")}
        </button>
      </nav>
    </div>
  );
}
