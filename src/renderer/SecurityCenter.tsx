import { useEffect, useRef, useState } from "react";
import type { BrowserState } from "../shared/contracts";
import type { SecurityAudit, SitePermission } from "../shared/security-center";
import { securityText } from "./security-center-i18n";
import { send } from "./store";
import { PrivacyControls } from "./PrivacyControls";
import { HeaderReview } from "./HeaderReview";
import { CodeReview } from "./CodeReview";

const managed = {
  "media:video": "camera",
  "media:audio": "microphone",
  geolocation: "location",
  notifications: "notifications",
  "clipboard-read": "clipboard",
  "clipboard-sanitized-write": "clipboardWrite",
  midi: "midi",
  "local-fonts": "fonts",
} as const;
export function SecurityCenter({
  browser,
  showPrivacyControls = true,
}: {
  browser: BrowserState;
  showPrivacyControls?: boolean;
}) {
  const t = (key: Parameters<typeof securityText>[1]) =>
    securityText(browser.settings.locale, key);
  const [audit, setAudit] = useState<SecurityAudit>();
  const [profileId, setProfile] = useState(
    browser.tabs.find((tab) => tab.id === browser.activeTabId)?.profileId ||
      "default",
  );
  const first = browser.tabs.find(
    (tab) => tab.profileId === profileId && /^https?:/.test(tab.url),
  );
  const [address, setAddress] = useState(
    first ? new URL(first.url).origin : "",
  );
  const addressEdited = useRef(false);
  const permissionGeneration = useRef(0);
  const [notice, setNotice] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [busy, setBusy] = useState(false);
  const availableOrigins = [
    ...new Set([
      ...browser.tabs
        .filter(
          (item) => item.profileId === profileId && /^https?:/.test(item.url),
        )
        .map((item) => new URL(item.url).origin),
      ...browser.permissions
        .filter((item) => item.profileId === profileId)
        .map((item) => item.origin),
    ]),
  ];
  const suggestedOrigin = availableOrigins[0] || "";
  useEffect(() => {
    if (!address && !addressEdited.current && suggestedOrigin)
      setAddress(suggestedOrigin);
  }, [address, suggestedOrigin]);
  useEffect(() => {
    permissionGeneration.current++;
    setSelectedTabId("");
    setNotice("");
    setInvalid(false);
  }, [profileId]);
  async function refresh() {
    const result = await send({ type: "security.audit" });
    if (result.ok) setAudit(result.data as SecurityAudit);
  }
  useEffect(() => {
    void refresh();
  }, []);
  let origin = "";
  try {
    const url = new URL(address);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      origin = url.origin;
  } catch {
    /* incomplete input */
  }
  const profile = browser.profiles.find((item) => item.id === profileId);
  const matchingTabs = browser.tabs.filter(
    (tab) =>
      tab.profileId === profileId &&
      !tab.suspended &&
      /^https?:/.test(tab.url) &&
      new URL(tab.url).origin === origin,
  );
  const target =
    matchingTabs.find((tab) => tab.id === selectedTabId) || matchingTabs[0];
  async function decide(
    permission: SitePermission,
    decision: "ask" | "deny" | "allow" | "once",
  ) {
    if (!origin || !profile || (decision === "once" && !target)) {
      setInvalid(true);
      return;
    }
    const generation = permissionGeneration.current;
    setNotice("");
    setBusy(true);
    try {
      const result = await send({
        type: "permission.set",
        profileId,
        origin,
        permission,
        decision,
        tabId: target?.id,
      });
      if (generation !== permissionGeneration.current) return;
      setInvalid(!result.ok);
      if (result.ok)
        setNotice(
          browser.settings.locale === "ru"
            ? "Разрешение сохранено для выбранного сайта"
            : "Permission saved for the selected site",
        );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card section"
      aria-label={t("title")}
      data-security-center
    >
      <h2>{t("title")}</h2>
      <HeaderReview browser={browser} />
      <CodeReview browser={browser} />
      {showPrivacyControls && <PrivacyControls settings={browser.settings} />}
      <p className="hint">{t("limitation")}</p>
      <button className="button" onClick={() => void refresh()}>
        {t("refresh")}
      </button>
      <details>
        <summary>
          {browser.settings.locale === "ru"
            ? "Технические результаты аудита"
            : "Technical audit results"}
        </summary>
        {audit && (
          <>
            <p className="hint">
              {t("captured")}:{" "}
              {new Date(audit.capturedAt).toLocaleString(
                browser.settings.locale,
              )}
            </p>
            <p role="status">
              {t("flags")}:{" "}
              {t(Object.values(audit.unsafeFlags).some(Boolean) ? "yes" : "no")}
            </p>
            <p>
              {t("protected")}:{" "}
              {t(audit.protectedStorageAvailable ? "yes" : "no")}
            </p>
            <p>
              {t("profiles")}:{" "}
              {audit.profileIsolation === null
                ? t("noProfiles")
                : t(audit.profileIsolation ? "yes" : "no")}
            </p>
            {audit.pages.map((page) => (
              <div className="card section" key={page.tabId || "shell"}>
                <strong>
                  {t(page.shell ? "shell" : "page")} ·{" "}
                  {page.origin || page.profileId}
                </strong>
                <dl>
                  {(
                    [
                      "sandbox",
                      "contextIsolation",
                      "nodeIntegration",
                      "webSecurity",
                      "javascript",
                    ] as const
                  ).map((key) => (
                    <div className="list-row" key={key}>
                      <dt>{t(key)}</dt>
                      <dd>{t(page[key] ? "yes" : "no")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </>
        )}
      </details>
      <h3>{t("policy")}</h3>
      <p className="hint">{t("policyHint")}</p>
      <label className="field">
        {t("profile")}
        <select
          aria-label={t("profile")}
          value={profileId}
          onChange={(event) => {
            permissionGeneration.current++;
            addressEdited.current = false;
            setProfile(event.target.value);
            const tab = browser.tabs.find(
              (item) =>
                item.profileId === event.target.value &&
                /^https?:/.test(item.url),
            );
            setAddress(tab ? new URL(tab.url).origin : "");
            setInvalid(false);
          }}
        >
          {browser.profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {browser.settings.locale === "ru"
          ? "Выбрать сайт из вкладок и сохранённых решений"
          : "Choose an open or saved site"}
        <select
          aria-label={
            browser.settings.locale === "ru" ? "Выбрать сайт" : "Choose website"
          }
          value={availableOrigins.includes(address) ? address : ""}
          disabled={busy || !availableOrigins.length}
          onChange={(event) => {
            addressEdited.current = true;
            setAddress(event.target.value);
            setSelectedTabId("");
            setInvalid(false);
            setNotice("");
          }}
        >
          <option value="">
            {browser.settings.locale === "ru"
              ? "Выберите сайт или введите адрес ниже"
              : "Choose a site or enter its URL below"}
          </option>
          {availableOrigins.map((site) => (
            <option key={site} value={site}>
              {site}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t("origin")}
        <input
          aria-label={t("origin")}
          placeholder="https://example.com"
          value={address}
          onChange={(event) => {
            addressEdited.current = true;
            setAddress(event.target.value);
            setSelectedTabId("");
            setNotice("");
            setInvalid(false);
          }}
        />
      </label>
      {!origin && (
        <p role="status">
          {browser.settings.locale === "ru"
            ? "Чтобы изменить разрешения, сначала введите адрес сайта выше (например https://example.com). Разрешения задаются отдельно для каждого сайта."
            : "Enter a website URL above first (for example https://example.com). Permissions are configured per site."}
        </p>
      )}
      {invalid && <p role="alert">{t("invalid")}</p>}
      {notice && (
        <p role="status" aria-live="polite">
          {notice}
        </p>
      )}
      {target && (
        <label className="field">
          {t("page")}
          <select
            aria-label={t("page")}
            value={target.id}
            onChange={(event) => setSelectedTabId(event.target.value)}
          >
            {matchingTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {profile?.mode === "tor" && <p>{t("tor")}</p>}
      {Object.entries(managed).map(([permission, label]) => {
        const policy = browser.permissions.find(
          (item) =>
            item.profileId === profileId &&
            item.origin === origin &&
            item.permission === permission,
        );
        const once = audit?.once.some(
          (item) =>
            item.profileId === profileId &&
            item.origin === origin &&
            item.permission === permission,
        );
        const decision = policy
          ? policy.allowed
            ? "allow"
            : "deny"
          : once
            ? "once"
            : "ask";
        return (
          <div className="list-row" key={permission}>
            <div className="list-main">
              <strong>{t(label)}</strong>
              <small>
                {t("changed")}:{" "}
                {policy?.updatedAt
                  ? new Date(policy.updatedAt).toLocaleString(
                      browser.settings.locale,
                    )
                  : "—"}
              </small>
            </div>
            <select
              aria-label={t(label)}
              value={profile?.mode === "tor" ? "deny" : decision}
              disabled={busy || !origin || profile?.mode === "tor"}
              onChange={(event) =>
                void decide(
                  permission as SitePermission,
                  event.target.value as "ask" | "deny" | "allow" | "once",
                )
              }
            >
              {(["ask", "deny", "allow", "once"] as const).map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={value === "once" && !target}
                >
                  {t(value)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {(
        [
          ["screen", "screenHint"],
          ["files", "fileHint"],
          ["cookies", "cookieHint"],
          ["popups", "popupHint"],
          ["ipc", "ipcHint"],
          ["ai", "aiHint"],
        ] as const
      ).map(([title, hint]) => (
        <div key={title}>
          <h3>{t(title)}</h3>
          <p className="hint">
            {t(
              title === "ai" && audit?.ai !== "not-connected-no-context-access"
                ? "aiTextHint"
                : hint,
            )}
          </p>
          {title === "ai" && audit && (
            <>
              <p>
                {t("aiGrants")}: {audit.aiAccess.grants} · {t("aiPreviews")}:{" "}
                {audit.aiAccess.pending}
              </p>
              <button
                className="button"
                onClick={() =>
                  void send({ type: "ai.context.revoke" }).then(refresh)
                }
              >
                {t("aiRevoke")}
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
