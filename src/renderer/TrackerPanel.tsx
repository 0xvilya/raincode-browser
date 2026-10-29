import { useEffect, useState } from "react";
import type { Settings } from "../shared/contracts";
import type { TrackerSnapshot } from "../shared/trackers";
import { send } from "./store";
import { translate, type MessageKey } from "./i18n";

export function TrackerPanel({
  settings,
  profileId,
}: {
  settings: Settings;
  profileId: string;
}) {
  const t = (key: MessageKey) => translate(settings.locale, key);
  const [snapshot, setSnapshot] = useState<TrackerSnapshot>();
  const [site, setSite] = useState("");
  const [invalid, setInvalid] = useState(false);
  async function refresh(clear = false) {
    const result = await send({
      type: clear ? "privacy.trackers.clear" : "privacy.trackers",
    });
    const data = result.data as TrackerSnapshot | undefined;
    if (result.ok && data?.profileId === profileId) setSnapshot(data);
  }
  useEffect(() => {
    void refresh();
  }, [profileId]);
  async function except() {
    try {
      const value = site.trim();
      if (!value || /\s/.test(value)) throw new Error();
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      const result = await send({
        type: "settings.update",
        settings: {
          trackerExceptions: [
            ...new Set([...settings.trackerExceptions, host]),
          ],
        },
      });
      if (result.ok) {
        setSite("");
        setInvalid(false);
      } else setInvalid(true);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <section
      className="card"
      aria-label={t("trackerTitle")}
      style={{ padding: 24, marginTop: 24 }}
    >
      <h2>{t("trackerTitle")}</h2>
      <p className="hint">{t("trackerHint")}</p>
      <div className="button-row">
        <button className="button" onClick={() => void refresh()}>
          {t("trackerRefresh")}
        </button>
        <button className="button" onClick={() => void refresh(true)}>
          {t("trackerClear")}
        </button>
        {snapshot && (
          <strong role="status">
            {t("trackerTotal")}: {snapshot.total}
          </strong>
        )}
      </div>
      <p className="hint">{t("trackerExceptionHint")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void except();
        }}
        className="button-row"
      >
        <input
          aria-label={t("trackerSite")}
          placeholder="example.com"
          value={site}
          onChange={(event) => {
            setSite(event.target.value);
            setInvalid(false);
          }}
          maxLength={2048}
        />
        <button
          className="button"
          disabled={settings.trackerExceptions.length >= 100}
        >
          {t("trackerExcept")}
        </button>
      </form>
      {invalid && <p role="alert">{t("trackerInvalid")}</p>}
      {settings.trackerExceptions.map((host) => (
        <div className="list-row" key={host}>
          <span className="list-main mono">{host}</span>
          <button
            className="button"
            onClick={() =>
              void send({
                type: "settings.update",
                settings: {
                  trackerExceptions: settings.trackerExceptions.filter(
                    (item) => item !== host,
                  ),
                },
              })
            }
          >
            {t("trackerRemove")}
          </button>
        </div>
      ))}
      {snapshot && snapshot.records.length === 0 && <p>{t("trackerEmpty")}</p>}
      {snapshot?.records.map((record) => (
        <div className="list-row" key={`${record.site}:${record.rule}`}>
          <span className="list-main">
            <strong>
              {record.site === "$private"
                ? t("trackerPrivate")
                : record.site === "$background"
                  ? t("trackerBackground")
                  : record.site}
            </strong>
            <small>
              {record.rule} ·{" "}
              {t(
                record.category === "analytics"
                  ? "trackerAnalytics"
                  : "trackerAds",
              )}
            </small>
          </span>
          <span>{record.count}</span>
        </div>
      ))}
    </section>
  );
}
