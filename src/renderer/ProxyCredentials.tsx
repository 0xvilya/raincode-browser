import { useEffect, useId, useState } from "react";
import type { Profile } from "../shared/contracts";
import { send } from "./store";
import { proxyCredentialText } from "./proxy-credentials-i18n";

export function ProxyCredentials({
  profile,
  available,
  locale,
}: {
  profile: Profile;
  available: boolean;
  locale: "ru" | "en";
}) {
  const id = useId();
  const t = (key: Parameters<typeof proxyCredentialText>[1]) =>
    proxyCredentialText(locale, key);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    "saved" | "cleared" | "failed" | undefined
  >();
  const [localStored, setLocalStored] = useState<boolean>();
  useEffect(() => {
    setUsername("");
    setPassword("");
    setResult(undefined);
    setLocalStored(undefined);
  }, [profile.id]);
  useEffect(() => {
    setLocalStored(undefined);
  }, [profile.hasCredentials]);
  useEffect(() => {
    if (!available) {
      setUsername("");
      setPassword("");
    }
  }, [available]);
  if (profile.mode !== "proxy" || !profile.proxy) return null;
  const supported =
    profile.proxy.scheme === "http" || profile.proxy.scheme === "https";
  const stored = localStored ?? Boolean(profile.hasCredentials);
  const update = async (clear: boolean) => {
    if (busy || (!clear && (!available || !supported || !username))) return;
    setBusy(true);
    setResult(undefined);
    try {
      const response = await send(
        clear
          ? { type: "proxy.credentials.clear", profileId: profile.id }
          : {
              type: "proxy.credentials.set",
              profileId: profile.id,
              username,
              password,
            },
      );
      if (response.ok) {
        setResult(clear ? "cleared" : "saved");
        setLocalStored(!clear);
      } else setResult("failed");
    } catch {
      setResult("failed");
    } finally {
      // Never retain editable credentials after any attempt or display response data.
      setUsername("");
      setPassword("");
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-title`} aria-busy={busy}>
      <h3 id={`${id}-title`}>{t("title")}</h3>
      {!supported ? (
        <p className="hint">{t("unsupported")}</p>
      ) : (
        <>
          <p className="hint">{t("hint")}</p>
          {!available && (
            <p role="alert" className="hint">
              {t("unavailable")}
            </p>
          )}
          <form
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              void update(false);
            }}
          >
            <div className="setting-row">
              <label htmlFor={`${id}-username`}>{t("username")}</label>
              <input
                id={`${id}-username`}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={512}
                value={username}
                disabled={busy || !available}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="setting-row">
              <label htmlFor={`${id}-password`}>{t("password")}</label>
              <input
                id={`${id}-password`}
                type="password"
                autoComplete="off"
                maxLength={2048}
                value={password}
                disabled={busy || !available}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="button"
              aria-label={`${t("save")} · ${profile.name}`}
              disabled={busy || !available || !username}
            >
              {t("save")}
            </button>
          </form>
        </>
      )}
      <p className="hint">{t(stored ? "stored" : "empty")}</p>
      <button
        type="button"
        className="button"
        aria-label={`${t("clear")} · ${profile.name}`}
        disabled={busy || !stored}
        onClick={() => void update(true)}
      >
        {t("clear")}
      </button>
      <p role={result === "failed" ? "alert" : "status"} aria-live="polite">
        {busy ? t("busy") : result ? t(result) : ""}
      </p>
    </section>
  );
}
