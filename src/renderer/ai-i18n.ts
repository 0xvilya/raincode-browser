const en = {
  openPrivacyCenter: "Open AI privacy in the shield center",
  title: "RainCode AI",
  chat: "Chat",
  pageContext: "Page context",
  collectContext: "Read page for preview",
  contextKind: "Analysis scope",
  textAndTags: "Page text and HTML tag structure",
  cssLayout: "Computed CSS layout sample",
  cssHint:
    "Samples up to 12 visible semantic elements. Includes layout, sizes and colors; excludes page text, forms, selectors, resource URLs and source stylesheets. This requires a separate code-read permission and preview approval",
  source: "Context source",
  activePage: "Active page",
  firstPane: "First pane",
  secondPane: "Second pane",
  bothPanes: "Both panes",
  contextHint:
    "After native permission, only a bounded text excerpt and tag structure are read. Review the whole preview: redaction can miss sensitive data. Forms, scripts, cookies and storage are excluded. The preview expires after one minute and is used only for this send.",
  contextConfirm:
    "I reviewed these page excerpts and approve including them in this request.",
  discardContext: "Discard excerpt",
  revokeContext: "Revoke AI data access and stop analysis",
  contextRevoked: "AI grants and pending previews cleared. Requests stopped.",
  contextExpired:
    "The page or preview changed or expired. Collect it again before sending.",
  contextDenied: "Page access was not granted.",
  contextReview: "Review and approve the page preview before sending.",
  connection: "Connection",
  privacy: "Privacy",
  close: "Close AI panel",
  statusIdle: "No request running",
  statusRunning: "Generating…",
  statusConnected: "Configured model",
  noProvider: "Configure a model to start chatting.",
  chooseModel: "Choose a model",
  setupModel: "Connect a model",
  provider: "Provider",
  model: "Model identifier",
  endpoint: "API endpoint",
  key: "API key",
  keyHint:
    "Saved only in OS-protected storage. A saved key is never shown again.",
  localHint:
    "Ollama uses a loopback server. Some installed models may still use cloud services; check your Ollama setup.",
  cloudHint:
    "Cloud messages go to your selected provider after you confirm each request. API charges may apply.",
  select: "Select configured model",
  newConnection: "New connection",
  save: "Save connection",
  remove: "Remove connection and key",
  discover: "Find installed Ollama models",
  test: "Test connection",
  tested: "Connection test passed for the selected model.",
  discovered: "Available models",
  manual: "You can enter a model ID manually.",
  vision: "Model accepts images (manual setting)",
  visionHint:
    "Image analysis is not connected yet. This setting does not send images.",
  connected:
    "Configuration saved. Connection not tested; no request has been sent.",
  removed: "Connection and stored key removed.",
  keyPlaceholder: "Paste key (hidden)",
  message: "Message",
  messagePlaceholder: "Ask a question…",
  send: "Send",
  stop: "Stop",
  newChat: "New chat",
  allowCloud:
    "I agree to send this conversation to the selected cloud provider for this request.",
  promptCloud: "Confirm cloud upload for this request.",
  providerUnavailable: "Configure a model first.",
  unsupportedProfile:
    "AI chat is currently limited to Direct profiles. Proxy and Tor routing require a verified safe transport.",
  pending:
    "Page text/tag structure and a bounded computed CSS sample are available with permission and preview. Source stylesheet, JavaScript/Console/Network inspection, screenshots and live vision are not connected yet.",
  noAutomatic:
    "No background AI requests. Page and screen access default to off.",
  error: "AI request failed",
  failedModels:
    "Could not list models. Confirm Ollama is running on this computer.",
  noModels: "No models reported by Ollama.",
  empty: "Start a new conversation. Nothing is sent until you press Send.",
} as const;
type Key = keyof typeof en;
const ru: Record<Key, string> = {
  openPrivacyCenter: "Открыть конфиденциальность ИИ в разделе щита",
  title: "RainCode ИИ",
  chat: "Чат",
  pageContext: "Контекст страницы",
  collectContext: "Прочитать страницу для предпросмотра",
  contextKind: "Область анализа",
  textAndTags: "Текст страницы и структура HTML-тегов",
  cssLayout: "Образец вычисленной CSS-разметки",
  cssHint:
    "До 12 видимых смысловых элементов: компоновка, размеры и цвета. Без текста страницы, форм, селекторов, URL ресурсов и исходных таблиц стилей. Нужны отдельное разрешение на чтение кода и подтверждение предпросмотра",
  source: "Источник контекста",
  activePage: "Активная страница",
  firstPane: "Первая панель",
  secondPane: "Вторая панель",
  bothPanes: "Обе панели",
  contextHint:
    "После системного разрешения читаются только ограниченный текст и структура тегов. Проверьте весь предпросмотр: маскирование может пропустить чувствительные данные. Формы, скрипты, cookies и хранилища исключаются. Предпросмотр действует одну минуту и только для этой отправки.",
  contextConfirm:
    "Я проверил фрагменты страниц и разрешаю включить их в этот запрос.",
  discardContext: "Удалить фрагмент",
  revokeContext: "Отозвать доступ ИИ к данным и остановить анализ",
  contextRevoked: "Разрешения ИИ и предпросмотры удалены. Запросы остановлены.",
  contextExpired:
    "Страница или предпросмотр изменились либо истекли. Прочитайте страницу заново.",
  contextDenied: "Доступ к странице не разрешён.",
  contextReview:
    "Проверьте и подтвердите предпросмотр страницы перед отправкой.",
  connection: "Подключение",
  privacy: "Приватность",
  close: "Закрыть панель ИИ",
  statusIdle: "Запрос не выполняется",
  statusRunning: "Генерация…",
  statusConnected: "Модель настроена",
  noProvider: "Настройте модель, чтобы начать чат.",
  chooseModel: "Выберите модель",
  setupModel: "Подключить модель",
  provider: "Провайдер",
  model: "Идентификатор модели",
  endpoint: "Адрес API",
  key: "API-ключ",
  keyHint:
    "Сохраняется только в защищённом хранилище ОС. Сохранённый ключ больше не показывается.",
  localHint:
    "Ollama использует локальный сервер. Некоторые установленные модели могут обращаться к облаку — проверьте настройки Ollama.",
  cloudHint:
    "Сообщения отправляются выбранному облачному провайдеру после подтверждения каждого запроса. Возможны расходы на API.",
  select: "Выбрать настроенную модель",
  newConnection: "Новое подключение",
  save: "Сохранить подключение",
  remove: "Удалить подключение и ключ",
  discover: "Найти установленные модели Ollama",
  test: "Проверить подключение",
  tested: "Проверка подключения выбранной модели пройдена.",
  discovered: "Доступные модели",
  manual: "Можно указать идентификатор модели вручную.",
  vision: "Модель поддерживает изображения (ручная настройка)",
  visionHint:
    "Анализ изображений ещё не подключён. Эта настройка ничего не отправляет.",
  connected:
    "Настройка сохранена. Соединение не проверено; запросы ещё не отправлялись.",
  removed: "Подключение и ключ удалены.",
  keyPlaceholder: "Вставьте ключ (скрыт)",
  message: "Сообщение",
  messagePlaceholder: "Задайте вопрос…",
  send: "Отправить",
  stop: "Остановить",
  newChat: "Новый чат",
  allowCloud:
    "Я разрешаю отправить эту беседу выбранному облачному провайдеру для этого запроса.",
  promptCloud: "Подтвердите отправку в облако для этого запроса.",
  providerUnavailable: "Сначала настройте модель.",
  unsupportedProfile:
    "Пока чат ИИ доступен только в профиле Direct. Для Proxy и Tor требуется проверенный безопасный транспорт.",
  pending:
    "Доступны текст, структура тегов и ограниченный образец вычисленных CSS-стилей с разрешением и предпросмотром. Исходные таблицы стилей, JavaScript/Console/Network, скриншоты и Live Vision пока не подключены.",
  noAutomatic:
    "Фоновых запросов к ИИ нет. Доступ к странице и экрану по умолчанию выключен.",
  error: "Ошибка запроса ИИ",
  failedModels:
    "Не удалось получить список моделей. Убедитесь, что Ollama запущена на этом компьютере.",
  noModels: "Ollama не сообщила об установленных моделях.",
  empty: "Начните беседу. До нажатия «Отправить» ничего не передаётся.",
};
export const aiText = (locale: "ru" | "en", key: Key) =>
  (locale === "ru" ? ru : en)[key];

export function aiErrorText(locale: "ru" | "en", value: string) {
  if (value === "AI_DISABLED")
    return locale === "ru"
      ? "ИИ отключён в разделе щита"
      : "AI is disabled in the shield center";
  if (value === "AI_CLOUD_DISABLED")
    return locale === "ru"
      ? "Облачные ИИ-провайдеры запрещены в разделе щита"
      : "Cloud AI providers are disabled in the shield center";
  if (value === "AI_CONSENT_REQUIRED") return aiText(locale, "contextDenied");
  if (value === "AI_PREVIEW_CONFIRM_REQUIRED")
    return aiText(locale, "contextReview");
  if (/^AI_(PREVIEW|PAGE_CHANGED|CONTEXT)/.test(value))
    return `${aiText(locale, "contextExpired")} (${value})`;
  if (!/^AI_[A-Z_0-9]+$/.test(value)) return value;
  const labels = {
    ru: {
      auth: "Ключ API отклонён или у него нет доступа к модели.",
      rate: "Превышена квота или частота запросов провайдера.",
      network:
        "Не удалось подключиться к серверу ИИ. Проверьте адрес и запущен ли сервер.",
      cancel: "Запрос остановлен.",
      key: "Сохраните ключ API в настройках подключения.",
      model: "Выбранная модель не установлена в Ollama.",
      redirect:
        "Сервер попытался перенаправить запрос. Перенаправления ИИ запрещены.",
      profile: "Выберите Direct-профиль этого подключения.",
      consent: "Подтвердите передачу данных в облако для этого запроса.",
      busy: "Предыдущий запрос ещё завершается. Повторите через мгновение.",
      other:
        "Провайдер не вернул допустимый ответ. Проверьте модель, адрес API и настройки подключения.",
    },
    en: {
      auth: "The API key was rejected or cannot access this model.",
      rate: "The provider quota or request rate was exceeded.",
      network:
        "Could not reach the AI server. Check the endpoint and that the server is running.",
      cancel: "Request stopped.",
      key: "Save an API key in connection settings.",
      model: "The selected Ollama model is not installed.",
      redirect: "The server attempted a redirect. AI redirects are blocked.",
      profile: "Select this connection's Direct profile.",
      consent: "Confirm cloud upload for this request.",
      busy: "The previous request is still finishing. Try again in a moment.",
      other:
        "The provider did not return a valid response. Check the model, API endpoint and connection settings.",
    },
  };
  const key = /HTTP_40[13]$/.test(value)
    ? "auth"
    : value.endsWith("HTTP_429")
      ? "rate"
      : /TRANSPORT|NETWORK/.test(value)
        ? "network"
        : /ABORTED/.test(value)
          ? "cancel"
          : /KEY_MISSING/.test(value)
            ? "key"
            : /MODEL_NOT_INSTALLED/.test(value)
              ? "model"
              : /REDIRECT/.test(value)
                ? "redirect"
                : /PROFILE/.test(value)
                  ? "profile"
                  : /CONSENT/.test(value)
                    ? "consent"
                    : /BUSY/.test(value)
                      ? "busy"
                      : "other";
  return `${labels[locale][key]} (${value})`;
}
