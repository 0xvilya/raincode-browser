const en = {
  title: "Security Center",
  audit: "Inspect current configuration",
  captured: "Snapshot time",
  profiles: "Profile isolation",
  noProfiles: "Open pages in two different profiles to inspect isolation.",
  protected: "OS-protected secret storage available",
  refresh: "Refresh audit",
  yes: "Enabled",
  no: "Disabled",
  blocked: "Blocked",
  flags: "Unsafe startup flags detected",
  sandbox: "Sandbox",
  contextIsolation: "Context isolation",
  nodeIntegration: "Node integration",
  webSecurity: "Web security",
  javascript: "JavaScript",
  shell: "Browser shell",
  page: "Web page",
  profile: "Profile",
  origin: "Site origin",
  policy: "Site permissions",
  policyHint:
    "Ask or Block reload matching pages to stop active access. Save forms first. One-operation access lasts for the selected page document only.",
  ask: "Ask each time",
  deny: "Block",
  allow: "Allow for site",
  once: "Allow once",
  changed: "Last changed",
  apply: "Apply permission",
  camera: "Camera",
  microphone: "Microphone",
  location: "Location",
  notifications: "Notifications",
  clipboard: "Clipboard read",
  clipboardWrite: "Clipboard write",
  midi: "MIDI",
  fonts: "Local fonts",
  screen: "Website screen capture",
  files: "Website file access",
  cookies: "Cookies",
  screenHint:
    "Denied by the website display-media handler. Internal AI capture is not enabled.",
  fileHint:
    "User-selected files only; file:// navigation and arbitrary filesystem access are blocked. Developer project access requires explicit selection.",
  cookieHint:
    "Separate profile sessions. Third-party cookie policy currently follows Chromium defaults; no stronger blocking is claimed.",
  popups: "Popups",
  popupHint:
    "Validated URLs open as controlled browser tabs; external protocols require confirmation.",
  ai: "AI data access",
  aiHint:
    "No AI provider is configured. Page collection requires a configured provider and native read permission. Screen capture remains unavailable.",
  aiTextHint:
    "AI chat receives typed messages and explicitly approved page excerpts. Each source requires native read permission and full preview approval. Cloud upload requires separate confirmation. Screenshots remain unavailable.",
  aiGrants: "Active AI page grants",
  aiPreviews: "Pending AI previews",
  aiRevoke: "Revoke AI access and stop analysis",
  ipc: "IPC boundary",
  ipcHint:
    "Shell sender, main frame, origin and command schema are checked. This reports configured checks, not a proof against every IPC attack.",
  limitation:
    "A local snapshot is not a security rating or a guarantee of safety. It inspects recorded creation options of open WebContents and known unsafe flags, not the complete operating system. Runtime preference introspection is not exposed by the supported Electron API.",
  tor: "Tor site permissions remain denied. These controls cannot override the Tor policy.",
  invalid:
    "Choose a valid HTTP(S) origin and a profile. Allow once needs an open page in that profile.",
};
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  title: "Центр безопасности",
  audit: "Проверить текущую конфигурацию",
  captured: "Время снимка",
  profiles: "Изоляция профилей",
  noProfiles: "Для проверки изоляции откройте страницы в двух разных профилях.",
  protected: "Доступно защищённое хранилище секретов ОС",
  refresh: "Обновить аудит",
  yes: "Включено",
  no: "Выключено",
  blocked: "Запрещено",
  flags: "Обнаружены опасные параметры запуска",
  sandbox: "Sandbox",
  contextIsolation: "Изоляция контекста",
  nodeIntegration: "Интеграция Node.js",
  webSecurity: "Web security",
  javascript: "JavaScript",
  shell: "Оболочка браузера",
  page: "Веб-страница",
  profile: "Профиль",
  origin: "Адрес сайта",
  policy: "Разрешения сайтов",
  policyHint:
    "«Спрашивать» и «Запретить» перезагружают страницы сайта, чтобы прекратить доступ. Сначала сохраните формы. Однократное разрешение действует только для выбранного документа вкладки.",
  ask: "Спрашивать каждый раз",
  deny: "Запретить",
  allow: "Разрешить для сайта",
  once: "Разрешить один раз",
  changed: "Последнее изменение",
  apply: "Применить разрешение",
  camera: "Камера",
  microphone: "Микрофон",
  location: "Геолокация",
  notifications: "Уведомления",
  clipboard: "Чтение буфера обмена",
  clipboardWrite: "Запись в буфер обмена",
  midi: "MIDI",
  fonts: "Локальные шрифты",
  screen: "Захват экрана сайтами",
  files: "Доступ сайтов к файлам",
  cookies: "Cookies",
  screenHint:
    "Запрещён обработчиком display-media для сайтов. Внутренний захват для ИИ ещё не включён.",
  fileHint:
    "Только файлы, выбранные пользователем; file:// и произвольный доступ к файловой системе заблокированы. Доступ к проекту разработчика требует явного выбора.",
  cookieHint:
    "Сессии профилей разделены. Политика сторонних cookies пока определяется Chromium; усиленная блокировка не заявляется.",
  popups: "Всплывающие окна",
  popupHint:
    "Проверенные URL открываются в управляемых вкладках; внешние протоколы требуют подтверждения.",
  ai: "Доступ ИИ к данным",
  aiHint:
    "ИИ-провайдер не настроен. Сбор страницы требует настроенного провайдера и системного разрешения на чтение. Захват экрана пока недоступен.",
  aiTextHint:
    "ИИ-чат получает введённые сообщения и явно одобренные фрагменты страниц. Для каждого источника нужны системное разрешение на чтение и подтверждение полного предпросмотра. Облачная отправка подтверждается отдельно. Скриншоты пока недоступны.",
  aiGrants: "Активные разрешения ИИ на чтение страниц",
  aiPreviews: "Ожидающие предпросмотры ИИ",
  aiRevoke: "Отозвать доступ ИИ и остановить анализ",
  ipc: "Граница IPC",
  ipcHint:
    "Проверяются отправитель оболочки, главный frame, origin и схема команды. Это состояние настроенных проверок, а не доказательство отсутствия всех IPC-атак.",
  limitation:
    "Локальный снимок — не рейтинг и не гарантия безопасности. Проверяются фактические параметры создания открытых WebContents и известные опасные флаги, а не вся операционная система. Поддерживаемый API Electron не предоставляет чтение этих параметров из runtime.",
  tor: "В Tor разрешения сайтов запрещены. Эти настройки не отменяют политику Tor.",
  invalid:
    "Выберите HTTP(S)-адрес сайта и профиль. Однократному разрешению нужна открытая страница этого профиля.",
};
export const securityText = (locale: "ru" | "en", key: Key) =>
  (locale === "ru" ? ru : en)[key];
