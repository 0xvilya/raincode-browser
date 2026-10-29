const en = {
  title: "Tor connection",
  subtitle:
    "An isolated session managed by RainCode. Connect explicitly before browsing.",
  vpnNotice:
    "VPN is not required for Tor and does not guarantee greater anonymity. Incorrect VPN/Tor configuration can reduce privacy. For anonymity-critical work, use official Tor Browser.",
  unavailable:
    "The verified Tor component is unavailable in this build. Onion addresses remain blocked; no direct fallback is used.",
  start: "Start Tor",
  stop: "Stop Tor",
  circuit: "New Tor circuit",
  identity: "New Tor identity",
  clear: "Delete temporary Tor data",
  stopped: "Stopped",
  starting: "Starting Tor",
  bootstrapping: "Connecting to the Tor network",
  ready: "Tor is connected",
  error: "Tor connection failed",
  bootstrap: "Tor bootstrap progress",
  phase: "Connection stage",
  reason: "Last connection problem",
  timeoutHelp:
    "Tor stopped making progress. Check your connection and clock, then retry. If direct Tor is blocked, an official Tor bridge may be needed; bridges are not configured in this build. No direct browsing fallback is used.",
  waitHelp:
    "A cold connection can take several minutes. Progress extends the waiting time, up to 10 minutes in total; 3 minutes without progress ends the attempt. You can stop at any time.",
  version: "Bundled Tor version",
  isolated:
    "Tor uses separate cookies, cache and storage. Stopping Tor blocks this profile's network connection.",
  identityHelp:
    "A new identity closes Tor tabs and clears their temporary browsing data. Circuit changes apply to new connections and may be rate limited by Tor.",
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: "Подключение Tor",
  subtitle:
    "Изолированная сессия под управлением RainCode. Подключение запускается явно.",
  vpnNotice:
    "VPN не обязателен для Tor и не гарантирует большей анонимности. Неправильная настройка VPN вместе с Tor может ухудшить приватность. Для критичных задач используйте официальный Tor Browser.",
  unavailable:
    "Проверенный компонент Tor недоступен в этой сборке. Onion-адреса заблокированы; прямое соединение не используется.",
  start: "Запустить Tor",
  stop: "Остановить Tor",
  circuit: "Новая цепочка Tor",
  identity: "Новая личность Tor",
  clear: "Удалить временные данные Tor",
  stopped: "Остановлен",
  starting: "Запуск Tor",
  bootstrapping: "Подключение к сети Tor",
  ready: "Tor подключён",
  error: "Ошибка подключения Tor",
  bootstrap: "Прогресс подключения Tor",
  phase: "Этап подключения",
  reason: "Последняя проблема подключения",
  timeoutHelp:
    "Прогресс подключения остановился. Проверьте соединение и системные часы, затем повторите попытку. Если прямое подключение Tor заблокировано, может потребоваться официальный мост Tor; в этой сборке мосты пока не настроены. Прямой переход к сайтам не используется.",
  waitHelp:
    "Первое подключение может занять несколько минут. При прогрессе ожидание продлевается, всего до 10 минут; 3 минуты без прогресса завершают попытку. Подключение можно остановить в любой момент.",
  version: "Версия встроенного Tor",
  isolated:
    "У Tor отдельные cookies, кэш и хранилище. Остановка Tor блокирует сетевое соединение этого профиля.",
  identityHelp:
    "Новая личность закрывает вкладки Tor и удаляет их временные данные. Новая цепочка применяется к новым соединениям; Tor может ограничивать частоту смены.",
};
export const torText = (locale: "ru" | "en", key: Key) =>
  (locale === "ru" ? ru : en)[key];
