const en = {
  title: "Proxy authentication",
  hint: "HTTP and HTTPS proxy credentials are protected by the operating system. They are not included in settings export and are never shown again here.",
  unsupported:
    "SOCKS5 authentication is not supported by this Electron integration. Use a SOCKS5 proxy without authentication or an HTTP/HTTPS proxy.",
  unavailable:
    "Protected OS storage is unavailable or locked. Saving credentials is disabled. You can still delete existing encrypted credentials.",
  username: "Proxy username",
  password: "Proxy password",
  save: "Save proxy credentials",
  clear: "Delete proxy credentials",
  saved: "Credentials saved",
  cleared: "Credentials deleted",
  failed:
    "The credential operation failed. No credential values are displayed. Check the protected storage and retry.",
  stored: "This profile has stored credentials.",
  empty: "This profile has no stored credentials.",
  busy: "Updating protected credentials…",
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: "Авторизация прокси",
  hint: "Учётные данные HTTP и HTTPS прокси защищаются операционной системой. Они не входят в экспорт настроек и не показываются повторно.",
  unsupported:
    "Авторизация SOCKS5 не поддерживается этой интеграцией Electron. Используйте SOCKS5 без авторизации или прокси HTTP/HTTPS.",
  unavailable:
    "Защищённое хранилище ОС недоступно или заблокировано. Сохранение отключено. Существующие зашифрованные данные можно удалить.",
  username: "Имя пользователя прокси",
  password: "Пароль прокси",
  save: "Сохранить данные прокси",
  clear: "Удалить данные прокси",
  saved: "Учётные данные сохранены",
  cleared: "Учётные данные удалены",
  failed:
    "Операция с учётными данными не выполнена. Значения не отображаются. Проверьте защищённое хранилище и повторите попытку.",
  stored: "У профиля есть сохранённые учётные данные.",
  empty: "У профиля нет сохранённых учётных данных.",
  busy: "Обновление защищённых данных…",
};
export const proxyCredentialText = (locale: "ru" | "en", key: Key) =>
  (locale === "ru" ? ru : en)[key];
