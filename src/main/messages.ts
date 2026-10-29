import type { Settings } from "../shared/contracts";
const messages = {
  ru: {
    aiCssReadPrompt: "Разрешить ИИ прочитать CSS-разметку для предпросмотра?",
    aiCssReadHint:
      "Только ограниченный образец вычисленных стилей и структуры тегов. Текст страницы, формы, URL ресурсов и исходные таблицы стилей не читаются. Перед отправкой вы увидите весь фрагмент",
    aiReadPrompt: "Разрешить ИИ прочитать эту страницу для предпросмотра?",
    aiReadHint:
      "Будет прочитан ограниченный текст и структура DOM. Поля форм, скрипты, cookies и хранилища исключаются. Автоматическое удаление секретов не безошибочно — проверьте весь предпросмотр. До подтверждения отправки данные остаются в памяти браузера.",
    aiReadOnce: "Прочитать один раз",
    aiReadSession: "Разрешить до перехода со страницы",
    aiUploadPrompt: "Отправить проверенные фрагменты страниц облачному ИИ?",
    aiUploadHint:
      "Указанный провайдер получит ровно текст предпросмотра вместе с беседой. Возможны расходы API. После отправки действие нельзя отменить у провайдера.",
    aiUpload: "Отправить фрагменты",
    aiTestPrompt: "Проверить облачную модель?",
    aiTestHint:
      "Провайдеру будет отправлена тестовая фраза «Reply with OK.». Возможна оплата по тарифу API. Содержимое страниц не отправляется.",
    aiTest: "Отправить тест",
    leavePage: "Покинуть страницу?",
    leavePageHint:
      "На странице могут быть несохранённые изменения. Для новой политики JavaScript требуется новый контекст страницы.",
    leave: "Покинуть страницу",
    NAVIGATION_DATA_PROTECTED:
      "Переход отменён: страница сохранила несохранённые данные. Сначала сохраните изменения.",
    SECRET_UNAVAILABLE:
      "Защищённое хранилище ОС недоступно. Пароль не сохранён; открытый текст не используется.",
    SECRET_FAILED:
      "Не удалось сохранить или прочитать защищённые учётные данные.",
    PROXY_AUTH_UNSUPPORTED:
      "Авторизация SOCKS5 не поддерживается Chromium. Используйте HTTP/HTTPS-прокси с авторизацией или SOCKS5 без пароля.",
    NETWORK_BLOCKED:
      "Network Kill Switch блокирует сеть RainCode. Отключите его на странице приватности, чтобы подключиться.",
    torOpen: "Открыть адрес в отдельной изолированной Tor-вкладке?",
    torWarning:
      "Режим Tor направляет соединение через сеть Tor, но RainCode Browser не обеспечивает тот же уровень защиты от fingerprinting, что официальный Tor Browser. Для задач, где критична анонимность, используйте официальный Tor Browser.",
    TOR_NOT_READY:
      "Tor ещё не подключён. Откройте страницу Tor и проверьте bootstrap. Прямое подключение запрещено.",
    TOR_COMPONENT_MISSING:
      "Проверенный компонент Tor отсутствует в этой сборке.",
    TOR_INTEGRITY:
      "Подлинность компонента Tor не подтверждена. Запуск заблокирован.",
    DEV_PAGE_REQUIRED:
      "Выберите открытую веб-страницу для инструментов разработчика.",
    PROJECT_REQUIRED: "Сначала выберите папку проекта через системный диалог.",
    PROJECT_PATH_DENIED:
      "Файл находится за пределами выбранного проекта или является ссылкой.",
    DEV_PAGE_CHANGED:
      "Страница изменилась после подтверждения. Выполнение отменено.",
    OPERATION_FAILED:
      "Не удалось выполнить действие. Проверьте адрес и настройки подключения.",
    PROFILE_INVALID: "Профиль недоступен или его настройки неверны.",
    PROXY_PROFILE_BUSY:
      "Сохраните данные, закройте веб-вкладки этого профиля и завершите его загрузки. Внутреннюю страницу настроек можно оставить открытой.",
    PROXY_UPDATE_FAILED:
      "Смена прокси не завершена. Сеть профиля заблокирована, в том числе после перезапуска. Повторно примените настройки прокси.",
    proxyChange: "Изменить прокси этого профиля?",
    proxyChangeHint:
      "Cookies и данные сайтов сохранятся. При смене сервера прежние учётные данные прокси будут удалены. Это не создаёт новую анонимную личность. При ошибке сеть профиля останется заблокированной.",
    TAB_INVALID: "Вкладка недоступна или порядок вкладок неверен.",
    TAB_LIMIT: "Достигнут предел: 100 вкладок. Закройте ненужные вкладки.",
    TAB_ACTIVE:
      "Активную вкладку или вкладку разделённого окна нельзя приостановить.",
    WORKSPACE_INVALID: "Рабочее пространство недоступно.",
    FILE_TOO_LARGE: "Файл настроек слишком большой. Максимум — 100 КБ.",
    SETTINGS_INVALID: "Файл не содержит поддерживаемые настройки RainCode.",
    IPC_DENIED: "Запрос из недоверенного интерфейса отклонён.",
    IPC_INVALID: "Команда браузера или её параметры неверны.",
    camera: "Камера",
    microphone: "Микрофон",
    geolocation: "Геолокация",
    notifications: "Уведомления",
    URL_INVALID:
      "Этот адрес или протокол не поддерживается. Используйте HTTP или HTTPS.",
    TOR_UNAVAILABLE:
      "Адреса .onion разрешены только в отдельном Tor Mode. В текущем профиле запрос заблокирован до отправки в сеть.",
    ONION_INVALID:
      "Некорректный адрес .onion. Нужен полный адрес onion v3: 56 букв и цифр перед .onion с верной контрольной суммой. Например, facebook.onion не является таким адресом. Скопируйте точный адрес с официального сайта владельца сервиса. Запрос не отправлен в DNS или поисковик.",
    PAGE_NOT_FOUND:
      "Сервер сообщил, что эта страница отсутствует (HTTP 404/410). Проверьте адрес или откройте новую вкладку. Можно посмотреть исходный ответ сайта.",
    TAB_SLEEP_PROTECTED:
      "Вкладка защищена от усыпления или ещё завершает выгрузку. Сначала сохраните данные и остановите медиа/загрузки. Закреплённые, активные, интерактивные и исключённые вкладки сохраняются в памяти.",
    SEARCH_EMPTY:
      "Поисковик сообщил, что по этому запросу нет результатов. Попробуйте другие слова или откройте исходную страницу результатов. Индексация onion-сайтов зависит от выбранного поисковика.",
    HTTPS_POLICY_CHANGED:
      "Включён режим HTTPS-only. Прежние соединения закрыты. Обновите страницу, чтобы продолжить с новой защитой.",
    PRIVACY_POLICY_CHANGED:
      "Настройки приватности изменены. Прежние контексты и соединения закрыты. Обновите страницу, чтобы применить новую политику.",
    SEARCH_INVALID: "Укажите HTTPS-шаблон поиска с одним {query}.",
    proxyFailed: "Прокси недоступен. Прямое подключение не использовалось.",
    torLoadFailed:
      "Не удалось загрузить страницу через Tor. Проверьте статус Tor; onion-сервис может быть недоступен. Можно повторить загрузку вручную. Прямое подключение не использовалось.",
    deny: "Запретить",
    once: "Разрешить один раз",
    always: "Разрешить для сайта",
    permission: "Разрешение сайта",
    permissionDetail: "Запрашиваемое разрешение:",
    external: "Открыть внешнее приложение?",
    open: "Открыть",
    cancel: "Отмена",
    download: "Сохранить загрузку?",
    downloadWarning:
      "Файл может быть небезопасным. Встроенная антивирусная проверка отсутствует. Открывайте файлы только из доверенных источников.",
    executable: "Потенциально опасный исполняемый файл или архив",
    save: "Сохранить",
    defaultProfile: "Основной",
    newtab: "Новая вкладка",
    deleteProfile: "Удалить профиль и все его cookies и локальные данные?",
    delete: "Удалить",
    tlsError:
      "Не удалось загрузить страницу. Проверьте сеть и сертификат сайта.",
    settingsImport: "Импортировать настройки из выбранного файла?",
    project: "Выберите папку локального проекта",
    clear: "Удалить cookies, кэш и данные этого сайта?",
  },
  en: {
    aiCssReadPrompt: "Allow AI to read CSS layout for preview?",
    aiCssReadHint:
      "Only a bounded sample of computed styles and tag structure. Page text, forms, resource URLs and source stylesheets are not read. You will review the entire excerpt before sending",
    aiReadPrompt: "Allow AI to read this page for preview?",
    aiReadHint:
      "A bounded text excerpt and DOM structure will be read. Form fields, scripts, cookies and storage are excluded. Automatic secret redaction is imperfect: review the entire preview. Data stays in browser memory until you confirm sending.",
    aiReadOnce: "Read once",
    aiReadSession: "Allow until this page navigates",
    aiUploadPrompt: "Send reviewed page excerpts to cloud AI?",
    aiUploadHint:
      "The selected provider will receive exactly the preview text with your conversation. API charges may apply. Upload cannot be undone at the provider.",
    aiUpload: "Send excerpts",
    aiTestPrompt: "Test the cloud model?",
    aiTestHint:
      "The provider will receive the test phrase ‘Reply with OK.’. API charges may apply. No page content is sent.",
    aiTest: "Send test",
    leavePage: "Leave this page?",
    leavePageHint:
      "The page may contain unsaved changes. A new JavaScript policy requires a new page context.",
    leave: "Leave page",
    NAVIGATION_DATA_PROTECTED:
      "Navigation canceled to preserve unsaved page data. Save your changes first.",
    SECRET_UNAVAILABLE:
      "OS-protected secret storage is unavailable. The password was not saved; no plaintext fallback is used.",
    SECRET_FAILED: "Protected credentials could not be saved or read.",
    PROXY_AUTH_UNSUPPORTED:
      "Chromium does not support SOCKS5 authentication. Use an authenticated HTTP/HTTPS proxy or SOCKS5 without credentials.",
    NETWORK_BLOCKED:
      "RainCode networking is blocked by Network Kill Switch. Turn it off in Privacy to connect.",
    torOpen: "Open this address in a separate isolated Tor tab?",
    torWarning:
      "Tor Mode routes connections through Tor, but RainCode Browser does not provide the same fingerprinting protection as official Tor Browser. For anonymity-critical tasks, use official Tor Browser.",
    TOR_NOT_READY:
      "Tor is not connected. Open Tor status and check bootstrap. Direct fallback is blocked.",
    TOR_COMPONENT_MISSING:
      "The verified Tor component is missing from this build.",
    TOR_INTEGRITY:
      "Tor component integrity could not be verified. Startup is blocked.",
    DEV_PAGE_REQUIRED: "Select an open web page for developer tools.",
    PROJECT_REQUIRED:
      "Choose a project folder through the system dialog first.",
    PROJECT_PATH_DENIED:
      "The file is outside the selected project or is a link.",
    DEV_PAGE_CHANGED:
      "The page changed after confirmation. Execution was cancelled.",
    OPERATION_FAILED:
      "The action could not be completed. Check the address and connection settings.",
    PROFILE_INVALID: "This profile is unavailable or its settings are invalid.",
    PROXY_PROFILE_BUSY:
      "Save your work, close this profile's web tabs and finish its downloads first. Internal settings tabs can remain open.",
    PROXY_UPDATE_FAILED:
      "Proxy change did not complete. This profile's network is blocked, including after restart. Apply its proxy configuration again.",
    proxyChange: "Change this profile's proxy?",
    proxyChangeHint:
      "Cookies and site data are retained. Changing the server removes its previous proxy credentials. This does not create a new anonymous identity. On failure the profile remains offline.",
    TAB_INVALID: "This tab is unavailable or the tab order is invalid.",
    TAB_LIMIT: "The limit of 100 tabs has been reached. Close unused tabs.",
    TAB_ACTIVE: "The active tab or a tab in split view cannot be suspended.",
    WORKSPACE_INVALID: "This workspace is unavailable.",
    FILE_TOO_LARGE: "The settings file is too large. The maximum is 100 KB.",
    SETTINGS_INVALID: "This file does not contain supported RainCode settings.",
    IPC_DENIED: "A request from an untrusted interface was rejected.",
    IPC_INVALID: "The browser command or its parameters are invalid.",
    camera: "Camera",
    microphone: "Microphone",
    geolocation: "Location",
    notifications: "Notifications",
    URL_INVALID: "This address or protocol is unsupported. Use HTTP or HTTPS.",
    TOR_UNAVAILABLE:
      "Onion addresses require the isolated Tor Mode. This profile blocked the request before network access.",
    ONION_INVALID:
      "Invalid .onion address. Use the full onion v3 address: 56 letters and digits before .onion with a valid checksum. For example, facebook.onion is not such an address. Copy the exact address from the service operator's official website. No DNS or search request was sent.",
    PAGE_NOT_FOUND:
      "The server reported that this page is missing (HTTP 404/410). Check the address or open a new tab. You can view the original site response.",
    TAB_SLEEP_PROTECTED:
      "This tab is protected from sleeping or is still unloading. Save your work and stop media/downloads first. Active, pinned, interactive and excluded tabs remain in memory.",
    SEARCH_EMPTY:
      "The search engine reported no results for this query. Try different words or view the original results page. Onion indexing depends on the selected search engine.",
    HTTPS_POLICY_CHANGED:
      "HTTPS-only enabled. Existing connections were closed. Reload the page to continue with the new protection.",
    PRIVACY_POLICY_CHANGED:
      "Privacy settings changed. Existing page contexts and connections were closed. Reload to apply the new policy.",
    SEARCH_INVALID: "Enter an HTTPS search template containing one {query}.",
    proxyFailed: "Proxy unavailable. No direct connection was used.",
    torLoadFailed:
      "Could not load this page through Tor. Check Tor status; the onion service may be unavailable. You can retry manually. No direct connection was used.",
    deny: "Deny",
    once: "Allow once",
    always: "Allow for site",
    permission: "Site permission",
    permissionDetail: "Requested permission:",
    external: "Open an external application?",
    open: "Open",
    cancel: "Cancel",
    download: "Save download?",
    downloadWarning:
      "This file may be unsafe. No built-in antivirus scanning is provided. Only open files from trusted sources.",
    executable: "Potentially dangerous executable or archive",
    save: "Save",
    defaultProfile: "Default",
    newtab: "New tab",
    deleteProfile: "Delete this profile and all its cookies and local data?",
    delete: "Delete",
    tlsError:
      "Could not load this page. Check the network and website certificate.",
    settingsImport: "Import settings from the selected file?",
    project: "Choose a local project folder",
    clear: "Delete cookies, cache and data for this site?",
  },
};
export function message(
  locale: Settings["locale"],
  key: keyof typeof messages.en,
): string {
  return messages[locale][key];
}
export function errorMessage(
  locale: Settings["locale"],
  error: unknown,
): string {
  const value = error instanceof Error ? error.message : "OPERATION_FAILED";
  if (Object.hasOwn(messages.en, value))
    return message(locale, value as keyof typeof messages.en);
  // Chromium/OS errors may contain complete URLs, filesystem paths or proxy
  // credentials. Keep these out of user-facing state and persistent metadata.
  return message(locale, "OPERATION_FAILED");
}

export function pageLoadMessage(
  locale: Settings["locale"],
  mode: string,
  nativeCode?: unknown,
): string {
  const key =
    mode === "tor"
      ? "torLoadFailed"
      : mode === "proxy"
        ? "proxyFailed"
        : "tlsError";
  const summary = message(locale, key);
  // Accept only Chromium's symbolic error identifier, never an Error message,
  // URL or OS path that might contain credentials or private addresses.
  return mode === "tor" &&
    typeof nativeCode === "string" &&
    /^ERR_[A-Z_]{1,64}$/.test(nativeCode)
    ? `${summary} (${nativeCode})`
    : summary;
}
