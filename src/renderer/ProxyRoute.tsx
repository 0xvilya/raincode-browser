import { useEffect, useState } from "react";
import { proxySchema, type Profile } from "../shared/contracts";
import { send } from "./store";

const labels = {
  en: {
    title: "Change proxy",
    scheme: "Protocol",
    host: "Proxy host",
    port: "Proxy port",
    bypass: "Connect directly to local addresses",
    save: "Apply proxy",
    saved: "Proxy configuration applied — reachability has not been tested",
    hint: "Close this profile's web tabs and finish downloads before changing its route. Site data stays in this profile; changing the endpoint removes old proxy credentials.",
    blocked:
      "Profile network blocked after an interrupted change. Apply a valid proxy configuration to recover.",
    failed: "Could not apply proxy configuration",
    canceled: "Change canceled",
  },
  ru: {
    title: "Изменить прокси",
    scheme: "Протокол",
    host: "Адрес прокси",
    port: "Порт прокси",
    bypass: "Подключаться к локальным адресам напрямую",
    save: "Применить прокси",
    saved: "Настройки прокси применены — доступность ещё не проверена",
    hint: "Перед сменой маршрута закройте веб-вкладки профиля и завершите загрузки. Данные сайтов сохранятся; при смене сервера прежние учётные данные прокси удаляются.",
    blocked:
      "Сеть профиля заблокирована после незавершённой смены. Примените корректные настройки прокси для восстановления.",
    failed: "Не удалось применить настройки прокси",
    canceled: "Изменение отменено",
  },
};

export function ProxyRoute({
  profile,
  locale,
  hasWebTabs,
}: {
  profile: Profile;
  locale: "ru" | "en";
  hasWebTabs: boolean;
}) {
  const t = labels[locale];
  const [proxy, setProxy] = useState(profile.proxy!);
  useEffect(
    () => setProxy(profile.proxy!),
    [
      profile.id,
      profile.proxy?.scheme,
      profile.proxy?.host,
      profile.proxy?.port,
      profile.proxy?.bypassLocal,
    ],
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const valid = proxySchema.safeParse(proxy).success;
  return (
    <details>
      <summary>
        {t.title} · {profile.name}
      </summary>
      <p className="hint">{t.hint}</p>
      {profile.proxyBlocked && <p role="alert">{t.blocked}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !valid || hasWebTabs) return;
          setBusy(true);
          setResult("");
          try {
            const response = await send({
              type: "proxy.update",
              profileId: profile.id,
              proxy,
            });
            setResult(
              response.ok
                ? response.data
                  ? t.saved
                  : t.canceled
                : response.error || t.failed,
            );
          } catch {
            setResult(t.failed);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="form-grid proxy-route-fields">
          <label className="field">
            {t.scheme}
            <select
              value={proxy.scheme}
              onChange={(event) =>
                setProxy({
                  ...proxy,
                  scheme: event.target.value as typeof proxy.scheme,
                })
              }
            >
              <option value="socks5">SOCKS5</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </label>
          <label className="field">
            {t.host}
            <input
              required
              maxLength={253}
              value={proxy.host}
              onChange={(event) =>
                setProxy({ ...proxy, host: event.target.value })
              }
            />
          </label>
          <label className="field">
            {t.port}
            <input
              required
              type="number"
              min={1}
              max={65535}
              value={proxy.port}
              onChange={(event) =>
                setProxy({ ...proxy, port: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={proxy.bypassLocal}
              onChange={(event) =>
                setProxy({ ...proxy, bypassLocal: event.target.checked })
              }
            />
            {t.bypass}
          </label>
        </fieldset>
        <button
          className="button"
          type="submit"
          disabled={busy || !valid || hasWebTabs}
        >
          {t.save}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {result}
      </p>
    </details>
  );
}
