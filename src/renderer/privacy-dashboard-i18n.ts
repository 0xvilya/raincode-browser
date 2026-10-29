const en = {
  privacy: "Privacy dashboard",
  security: "Security dashboard",
  privacyIntro: "Local data, connections and permissions under your control.",
  securityIntro:
    "Browser isolation policy and the connection controls that are actually active.",
  overview: "Current profile",
  direct: "Direct",
  proxy: "Proxy",
  private: "Private",
  tor: "Tor",
  profile: "Profile",
  connection: "Connection",
  directHint:
    "Websites see your direct connection. This mode does not hide your IP.",
  proxyHint:
    "This profile uses its configured proxy. The proxy operator is part of your trust boundary.",
  privateHint:
    "An isolated temporary session. Private mode does not hide your IP or protect against local malware.",
  torHint:
    "An isolated Tor session. RainCode does not provide Tor Browser's fingerprinting protection.",
  kill: "Network Kill Switch",
  killHint:
    "Closes RainCode pages, cancels downloads and local commands, blocks profile network requests and stops Tor. Other OS apps are outside its control; this is not an OS firewall.",
  killOn: "Network blocking enabled",
  killOff: "Profile networking permitted",
  history: "Browsing history",
  historyHint:
    "Save ordinary profile visits locally. Private and Tor visits are excluded from persisted history.",
  historyOn: "Local history enabled",
  historyOff: "New visits are not saved to history",
  retention:
    "History settings do not remove bookmarks, downloaded files or OS traces. Existing history can be cleared on its own page.",
  policies: "Application isolation policy",
  policiesHint:
    "These are configured protections, not a vulnerability scan or a verdict about the current website.",
  sandbox: "Chromium sandbox",
  sandboxHint: "Untrusted page processes run with the sandbox enabled.",
  context: "Context isolation",
  contextHint:
    "Website JavaScript is separate from the trusted browser interface.",
  node: "No website Node.js API",
  nodeHint:
    "Pages do not receive Node.js or the RainCode IPC bridge. Tor's all-frame guard is tested separately.",
  tls: "TLS certificate checks",
  tlsHint:
    "Certificate validation is enforced. RainCode does not bypass certificate errors.",
  active: "Configured",
  permissions: "Saved site permissions",
  permissionsHint:
    "Saved allow/deny decisions for all profiles. Revocation removes the decision and reloads matching open pages.",
  allowed: "Allowed",
  denied: "Denied",
  revoke: "Revoke",
  noPermissions: "No saved permission decisions.",
  limitations: "What this dashboard does not promise",
  fingerprint: "Fingerprinting",
  fingerprintHint:
    "Fonts, canvas, GPU, account logins and browser behaviour can identify you. Private, Proxy and Tor modes do not guarantee anonymity.",
  google: "Zero Google scope",
  googleHint:
    "The RainCode shell blocks external HTTP/WebSocket requests and uses bundled assets. Remote spellchecking is disabled. Visited sites may use Google services; a complete audit of Chromium and OS background traffic remains outstanding.",
  vpn: "VPN",
  vpnHint:
    "RainCode does not configure an OS VPN or prove VPN routing. A proxy or Tor profile is not a device-wide VPN.",
  audit: "Leak testing",
  auditHint:
    "Controlled SOCKS tests and a real owned-onion smoke were run. Full DNS/IP/UDP packet-capture certification is still outstanding.",
  network: "Connection settings",
  settings: "Browser settings",
  openHistory: "Open history",
  openTor: "Tor status",
};

type MessageKey = keyof typeof en;
const ru: Record<MessageKey, string> = {
  privacy: "Панель приватности",
  security: "Панель безопасности",
  privacyIntro:
    "Локальные данные, соединения и разрешения под вашим контролем.",
  securityIntro:
    "Политика изоляции браузера и действующие настройки соединения.",
  overview: "Текущий профиль",
  direct: "Прямое соединение",
  proxy: "Прокси",
  private: "Приватный",
  tor: "Tor",
  profile: "Профиль",
  connection: "Соединение",
  directHint: "Сайты видят ваше прямое соединение. Этот режим не скрывает IP.",
  proxyHint:
    "Профиль использует настроенный прокси. Оператор прокси входит в границу доверия.",
  privateHint:
    "Отдельная временная сессия. Приватный режим не скрывает IP и не защищает от локального malware.",
  torHint:
    "Отдельная сессия Tor. RainCode не обеспечивает защиту от fingerprinting на уровне Tor Browser.",
  kill: "Network Kill Switch",
  killHint:
    "Закрывает страницы RainCode, отменяет загрузки и локальные команды, блокирует запросы профилей и останавливает Tor. Другие приложения ОС не контролируются; это не системный firewall.",
  killOn: "Блокировка сети включена",
  killOff: "Сетевые запросы профилей разрешены",
  history: "История посещений",
  historyHint:
    "Сохранять посещения обычных профилей локально. Посещения Private и Tor не входят в постоянную историю.",
  historyOn: "Локальная история включена",
  historyOff: "Новые посещения не записываются в историю",
  retention:
    "Настройка истории не удаляет закладки, скачанные файлы или следы ОС. Существующую историю можно очистить на её странице.",
  policies: "Политика изоляции приложения",
  policiesHint:
    "Это настроенные механизмы защиты, а не сканирование уязвимостей или оценка текущего сайта.",
  sandbox: "Chromium sandbox",
  sandboxHint:
    "Процессы недоверенных страниц работают с включённой песочницей.",
  context: "Изоляция контекста",
  contextHint: "JavaScript сайта отделён от доверенного интерфейса браузера.",
  node: "Без Node.js API для сайтов",
  nodeHint:
    "Страницы не получают Node.js и IPC-мост RainCode. All-frame guard Tor проверяется отдельно.",
  tls: "Проверка TLS-сертификатов",
  tlsHint:
    "Проверка сертификатов включена. RainCode не обходит ошибки сертификатов.",
  active: "Настроено",
  permissions: "Сохранённые разрешения сайтов",
  permissionsHint:
    "Сохранённые решения разрешить/запретить для всех профилей. Отзыв удаляет решение и перезагружает соответствующие открытые страницы.",
  allowed: "Разрешено",
  denied: "Запрещено",
  revoke: "Отозвать",
  noPermissions: "Сохранённых решений о разрешениях нет.",
  limitations: "Чего эта панель не обещает",
  fingerprint: "Fingerprinting",
  fingerprintHint:
    "Шрифты, canvas, GPU, вход в аккаунт и поведение браузера могут вас идентифицировать. Private, Proxy и Tor не гарантируют анонимность.",
  google: "Границы Zero Google",
  googleHint:
    "Оболочка RainCode блокирует внешние HTTP/WebSocket-запросы и использует встроенные материалы. Удалённая проверка орфографии отключена. Открытые сайты могут использовать сервисы Google; полный аудит фонового трафика Chromium и ОС ещё не завершён.",
  vpn: "VPN",
  vpnHint:
    "RainCode не настраивает VPN операционной системы и не подтверждает его маршрутизацию. Прокси и Tor-профиль не являются VPN всего устройства.",
  audit: "Проверки утечек",
  auditHint:
    "Выполнены контролируемые SOCKS-тесты и реальная проверка собственного onion. Полная аттестация с захватом DNS/IP/UDP-пакетов ещё не проведена.",
  network: "Настройки соединения",
  settings: "Настройки браузера",
  openHistory: "Открыть историю",
  openTor: "Статус Tor",
};

export const dashboardText = (locale: "ru" | "en", key: MessageKey) =>
  (locale === "ru" ? ru : en)[key];
