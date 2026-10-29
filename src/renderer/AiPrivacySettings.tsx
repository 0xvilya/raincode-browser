import { useEffect, useState } from "react";
import type { Settings } from "../shared/contracts";
import type { SecurityAudit } from "../shared/security-center";
import { send } from "./store";

const labels = {
  en: {
    title: "AI privacy",
    enabled: "Enable AI integrations",
    cloud: "Permit cloud AI providers",
    hint: "Disabling AI stops generation and revokes page grants and previews. Stored connections and protected keys are retained. Cloud permission only permits requests: each upload still requires its existing explicit confirmation.",
    scope:
      "Private, proxy and Tor profiles cannot provide page context. Page access requires native permission and preview; screen capture is unavailable. The assistant cannot execute commands or edit files.",
    stop: "Stop AI and revoke context",
    refresh: "Refresh AI access",
    grants: "Active grants",
    previews: "Pending previews",
    connections: "Open AI connections",
    saved: "AI privacy settings saved",
    failed: "Could not update AI privacy settings",
  },
  ru: {
    title: "Конфиденциальность ИИ",
    enabled: "Разрешить интеграции ИИ",
    cloud: "Разрешить облачных ИИ-провайдеров",
    hint: "Отключение ИИ останавливает генерацию, отзывает доступ к страницам и предпросмотры. Подключения и защищённые ключи сохраняются. Разрешение облака только допускает запросы: каждая отправка по-прежнему требует отдельного явного подтверждения.",
    scope:
      "Контекст приватных, прокси- и Tor-профилей недоступен ИИ. Чтение страницы требует системного разрешения и предпросмотра; захват экрана недоступен. Ассистент не может выполнять команды и изменять файлы.",
    stop: "Остановить ИИ и отозвать контекст",
    refresh: "Обновить доступ ИИ",
    grants: "Активные разрешения",
    previews: "Ожидающие предпросмотры",
    connections: "Открыть подключения ИИ",
    saved: "Настройки конфиденциальности ИИ сохранены",
    failed: "Не удалось изменить настройки конфиденциальности ИИ",
  },
};

export function AiPrivacySettings({ settings }: { settings: Settings }) {
  const t = labels[settings.locale];
  const [audit, setAudit] = useState<SecurityAudit>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function refresh() {
    const response = await send({ type: "security.audit" });
    if (response.ok) setAudit(response.data as SecurityAudit);
  }
  useEffect(() => {
    void refresh();
  }, [settings.aiEnabled, settings.aiCloudEnabled]);
  async function update(key: "aiEnabled" | "aiCloudEnabled", value: boolean) {
    setBusy(true);
    try {
      const response = await send({
        type: "settings.update",
        settings: { [key]: value },
      });
      setStatus(response.ok ? t.saved : t.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card section" aria-label={t.title}>
      <h2>{t.title}</h2>
      <p className="hint">{t.hint}</p>
      {(["aiEnabled", "aiCloudEnabled"] as const).map((key) => (
        <label className="setting-row" key={key}>
          <span>{t[key === "aiEnabled" ? "enabled" : "cloud"]}</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings[key]}
            disabled={busy}
            onChange={(event) => void update(key, event.target.checked)}
          />
        </label>
      ))}
      <p className="hint">{t.scope}</p>
      {audit && (
        <p>
          {t.grants}: {audit.aiAccess.grants} · {t.previews}:{" "}
          {audit.aiAccess.pending}
        </p>
      )}
      <div className="button-row">
        <button
          className="button"
          type="button"
          onClick={() => void send({ type: "ai.context.revoke" }).then(refresh)}
        >
          {t.stop}
        </button>
        <button className="button" type="button" onClick={() => void refresh()}>
          {t.refresh}
        </button>
        <button
          className="button"
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("raincode-open-ai"))
          }
        >
          {t.connections}
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
