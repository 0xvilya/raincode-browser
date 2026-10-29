# Changelog

## 0.5.13 — монитор запросов в центре приватности

- Монитор включается для выбранной вкладки только по действию пользователя, показывает реальные наблюдаемые запросы и решения блокировки
- Сохраняются только ограниченные группы доменов в памяти; остановка, закрытие вкладки, переход на другой origin и смена профиля очищают записи
- Постоянный индикатор с кнопкой остановки в панели браузера; активность без привязки к вкладке и утечки ОС монитор не подтверждает

## 0.5.12 — единый центр щита и безопасная смена прокси

- Убраны дубли настроек приватности и DNS из общих настроек; поиск и восстановление сессии перенесены под щит, старые адреса ведут в тот же интерфейс
- Добавлены сохраняемые запреты всех ИИ-запросов/облака с проверкой в main process и немедленным отзывом доступа
- Прокси-профили могут менять сервер после закрытия веб-вкладок/загрузок, с сохранением данных сайтов и сбросом прежних учётных данных сервера
- Незавершённая смена сохраняет сетевую блокировку профиля после перезапуска; настройки проверяются через нативный resolveProxy без DIRECT fallback
- У постоянных сессий принудительно обновляется конфигурация прокси перед проверкой маршрута; усилена проверка адреса прокси

## 0.5.11 — профили по потребности

- Убрано искусственное ограничение30профилей; Chromium-сессия создаётся при использовании профиля
- Проверены35профилей, раздельные cookies и два независимых контролируемых прокси с восстановлением после перезапуска

## 0.5.10 — аудит защиты и космические обломки

- Космос использует редкие плавно движущиеся обломки вместо дождя, тумана и стеклянных капель; существующие FPS/энергосбережение/Reduced Motion сохранены
- Исправлен обход известных tracker-host правил запросами без определённого источника
- Tor-политика отклоняет IPv6 multicast-адреса в дополнение к локальным сетям
- Исправлена типизация проверки миниатюр; добавлены регрессионные проверки и таблица80механизмов с реальными ограничениями в TEST_REPORT

## 0.5.9 — вся коллекция реалистичных фонов

- Реалистичные Париж, лес, горы, океан, сакура, кибергород и космос вместо плоских рисунков
- Минималистичные темы получили спокойные фотографические фактуры базальта и известняка
- Все12сцен доступны локально; прежний векторный режим сохранён отдельно
- Более естественная насыщенность и небольшой контраст фотографий, без размытия; приоритет активному фону и ленивая загрузка галереи

## 0.5.8 — анализ CSS с разрешением

- Выбор области анализа в панели ИИ: текст/структура тегов или ограниченный образец вычисленных CSS-стилей
- Отдельное разрешение на чтение кода, предпросмотр точного отправляемого фрагмента, одноразовая отправка и отзыв доступа
- Исправлено исключение редактируемых областей с наследуемым contenteditable/designMode и списков ARIA-ролей из контекста ИИ

## 0.5.7 — единый центр и реалистичные сцены

- Щит открывает единый центр приватности, разрешений, ИИ, Tor, профилей и DNS с раскрывающимися разделами
- Оригинальные локальные фоны снежного Нью-Йорка и дождливого Токио; векторные варианты доступны отдельно
- DNS-управление переиспользуется в центре и настройках, старые адреса внутренних страниц сохранены

## 0.5.6 — настройки и обнаруживаемость

- Галерея 12 локальных фонов, снежный Manhattan/Brooklyn Bridge, более узнаваемый Tokyo
- Снег в существующем адаптивном canvas с отключением анимации, без второго цикла
- Произвольные цвета панелей/акцента, сохранение и сброс, безопасная hex-валидация
- Переходы между разделами настроек и открытие ИИ, меню без многоточия, заголовки без завершающих точек
- Удобные Privacy presets, applied/pending, staged exceptions, без потери draft и повторного закрытия страниц при неизменной политике
- Короткое название Tor; предупреждения о fingerprinting и отсутствии гарантированной анонимности сохранены

## 0.5.5 — 2026-10-26

- Permission-gated Page Context: native once/current-document grants before a bounded isolated-world read, exact in-memory preview and mandatory approval before Send. Independent visible Split sources can be combined. Cloud page uploads require a separate native confirmation; Direct same-profile only.
- Form/editable/hidden/script/iframe content, URL paths/query/fragments, cookies and storage are excluded. Obvious keys/tokens/emails are masked; user review remains required because automatic redaction is imperfect. No arbitrary page instructions become tools or privileged actions.
- Preview tickets expire after60s and are invalidated on navigation/close/crash/profile changes/Stop/lock/revoke. Context-bound requests abort when the source document ends. Security Center exposes actual grant/preview counts and revocation.
- CSS/JavaScript source inspection, screenshots, Live capture and visual comparison remain unfinished; no fake controls for them.

## 0.5.4 — 2026-10-26

- Independent background selector: London and eleven original local vector scenes, including Tokyo and New York; persistent across restart.
- Visible AI sidebar, lazy/resizable chat panel, Ollama model discovery and OpenAI-compatible text streaming, explicit connection tests, cancellation and per-request cloud consent. API keys use OS-protected SecretStore; configuration contains no key. Direct profiles only in this checkpoint; page/code/screenshots/live/compare remain unavailable.
- Standard/Strict/Maximum privacy modes and exact-origin exceptions. Known-host tracker policy, cross-origin request/response cookie-header filtering (unknown initiators fail closed in Strict), and native JavaScript preferences. Unsaved beforeunload data survives canceling a cross-policy navigation. Third-party JavaScript cookie/storage isolation remains incomplete.
- Browser shell denies external HTTP/WebSocket requests. No unsafe Chromium security flags added. Fixed Electron's documented empty Response.url causing false AI redirect rejection; redirects themselves remain blocked.

## 0.5.3 — development checkpoint, 2026-10-26

- Security Center: local audit of recorded WebContents creation options/known startup flags/profile sessions/OS secret storage, explicit limits and no score. Scoped Ask/Block/Allow/Once policies, update timestamps, persisted deny, current-document once, cross-profile revoke and stale-prompt protection.
- Existing WebContentsView Split View extended with stable pane IDs, horizontal/vertical layouts,25–75%ratio,swap,pane tab selection, independent address/history/reload/stop/DevTools/zoom, session restore and close without destroying pages. Visible panes cannot sleep. Internal pages occupy the full browser area; pane-owned all-tab membership/newtab flow/drag divider/four direction menu remain unfinished.
- Vertical tab local search/collapse persistence, shared pin/group/drag controls verified together with split. No background polling.
- Standard white remote canvas restores readability of unstyled black-text pages; page CSS is not modified. Pane zoom uses Electron isolated mode.
- AI providers/chat/context/screenshot/live/compare and AI consent manager are NOT implemented in this checkpoint. No AI traffic or continuous capture. Windows directory build only; installed0.5.2 is untouched.

## 0.5.2 — 2026-10-25

- Холодный onion TCP preconnect через локальный Tor SOCKS5 (ATYP03) перед Chromium, без HTTP payload или direct/DNS fallback. Bounded180s/16pending/64cached, очистка при stop/fail/circuit/identity/kill.
- Bootstrap ожидает реальный прогресс: idle180s/total600s; UI показывает sanitized phase/reason/count. Timeout и потеря control channel закрывают канал/профиль; события старого daemon не меняют новую сессию.
- Реальный dev Tor matrix PASS: own-v3 first attempt113s, Cyrillic search/link/source/clearnet, DDG10organic0visibleads, crash/restart/identity/kill/clear. Cold31s Electron regression PASS. Это не гарантия доступности всех onion.
- Smoke сохраняет безопасные этапы/тайминги/коды ошибок; --wait-descriptor только опциональный readiness probe своего fixture, по умолчанию выключен.

## 0.5.1 — 2026-10-25

- Исправлена потеря первичной ошибки Tor при остановке daemon после таймаута; поздний bootstrap не оживляет error/stopped сессию. Добавлены два regression-теста.
- Live Tor0.5.0 не прошёл: own-onion timeout, затем bootstrap failure. Не выдавать это за успешную внешнюю проверку0.5.1.

## 0.5.0 — 2026-10-25

- Event-driven auto-sleep без постоянного опроса, OFF/5/15/30/60min, keepAwake; native WebContents освобождается и восстанавливается по URL. Защищены активные/split/pinned/interactive/complex/sessionStorage/media/permission/download/DevTools страницы; beforeunload сохраняется. Generic JS heap не сохраняется.
- ECO/BALANCED/ULTRA устанавливают20/30/60 decorative FPS, поддержаны manual cap/weak hardware/powerSave/graphicsOFF. Сайты не ограничиваются этими FPS.
- Download progress обновляет UI/SQLite максимум раз250ms, done/quit остаются немедленными. Таймеры очищаются.
- Реальные bounded tracker counters, ads/analytics и exact-host exceptions; private/Tor источники скрыты, журнал в памяти. Восемь локальных third-party analytics правил добавлены к прежним14 ad-host правилам; maintained subscriptions пока TODO.
- Добавлены F5/Shift+F5/Ctrl+F5. Sandbox/TLS/IPC защиты сохранены.
- Raincod Auto Continue: подтверждённая heartbeat-автоматизация в существующем чате каждые6часов; не отключается, пока обязательные задачи не проверены полностью.

## 0.4.0 — 2026-10-25

- Устранена белая native-страница поверх сообщения об ошибке; брендированные404/410 и подтверждённые DDG empty-results с доступом к исходному ответу. Invalid address оформлен доступным диалогом RainCode.
- Отдельный настраиваемый Tor search engine, HTTPS и v3 onion templates; корректный consent для onion-ссылок/новых окон из Direct, без скрытого изменения профиля.
- Локальная блокировка рекламы и косметика слотов/промо DuckDuckGo, global off/on без изменения органических результатов и удалённой загрузки списков. Полное удаление любой first-party/video рекламы не гарантируется.
- Диагностика Direct/Private IP и явный RIPEstat ASN/network holder lookup. DNS/provider lookup в Tor/Proxy/onion заблокирован. АдресCDN и владелец сети не доказывают origin hosting.
- Командная панель проекта: реальный PowerShell/sh, Unicode, история, Stop, Copy/Clear, CWD; native подтверждение сохранено. Неинтерактивный runner ограничен15s/64K символов, не PTY.

## 0.3.1 — 2026-10-25

- Исправлен security bug: частичный settings IPC update больше не вставляет defaults, не отключает Network Kill Switch и не сбрасывает выключенные эффекты.
- Многослойный дождь, потёки на стекле, туман/отражения и медленное bokeh; bounded FPS/DPR/частицы и энергосбережение. Явный выбор system/full/reduced объясняет паузу от Windows.
- Поле поиска >=16px, уменьшен левый отступ. Blur и дробный parallax удалены с текста, сцена продолжает двигаться отдельно. Enter при IME composition не отправляет домашний поиск.
- Invalid onion/v2/checksum получает понятную диагностику до Tor/DNS/search; facebook.onion не подменяется выдуманным сервисом.
- HTTPS-only включён по умолчанию: upgrade публичного HTTP GET/HEAD, отказ от небезопасных записей/ws, без fallback. Существующие page realms/connections закрываются при включении. Loopback dev и end-to-end onion v3 внутри Tor — явные исключения; это не VPN/шифрование всего трафика ОС.

## 0.3.0 — 24 октября 2026

- Исправлена локализованная диагностика Tor navigation: безопасный Chromium code без URL/секретов. Installed onion/source и принудительный daemon crash/fail-closed/explicit fresh restart проверены настоящим запуском. Network smoke перезаписывает stale PASS при ошибке и записывает версию/режим/этап/попытки и обезличенные stream statuses.

- Network Kill Switch закрывает WebContents/соединения и service workers всех профилей, отменяет загрузки и одобренные локальные команды, останавливает собственный Tor. Экстренное включение не ждёт обычную очередь IPC; снятие блокировки не возобновляет страницы автоматически. Это ограничение внутри RainCode, не системный firewall.
- Учётные данные HTTP/HTTPS proxy зашифрованы через Electron safeStorage (Windows DPAPI). Пароли отсутствуют в обычном state/SQLite/export; отзыв защищён от гонки async decrypt. SOCKS5 authentication не поддерживается.
- Отдельные Security/Privacy Dashboard, работающие переходы и переключатели; исправлена кнопка создания Private profile.
- Dev Panel выбирает реальную страницу: Page Info/UA/CSS/DevTools больше не направляются во внутренний UI. Responsive preview390px сохраняет документ и введённые формы; полная device emulation доступна через Chromium DevTools.
- Начальное Direct подключение исключает автоматическое WPAD discovery; контролируемый HTTP proxy и SOCKS override проверены. Startup audit использует localhost positive control и явно ограничивает выводы рамками Chromium NetLog.
- electron-builder26.18.0; сборка и итоговые результаты этого этапа публикуются в TEST_REPORT.md. VPN по решению пользователя не интегрируется; VPN не обязателен для работы Tor и не гарантирует анонимность.

## 0.2.0 — 24 октября 2026

### Исправления рабочего браузера

- Omnibox не перезаписывает редактируемый текст снимками состояния; корректно обрабатывает composition, кириллицу, латиницу, Enter/Escape и локальные подсказки. Для текста используются обычный Segoe UI/system font, нормальный интервал и поверхность без blur/transform.
- Горячие клавиши обрабатываются единым native-обработчиком оболочки и сайтов с учётом AltGr, composition и физических key codes. Escape в поле отменяет ввод; вне редактируемого поля и overlay останавливает загрузку.
- Навигация учитывает внутренние страницы и историю Chromium; сохраняются адреса и заголовки без Chromium pageState с формами/паролями. Исправлено восстановление выбранной закрытой вкладки по ID.
- Разделены History, Recently Closed и Workspaces; отображаются время закрытия и favicon. Закрытие уничтожает соответствующий WebContents.
- DevTools и View Source относятся к выбранной веб-странице. Developer Workspace позволяет явно выбрать страницу назначения вместо исполнения кода в интерфейсе браузера.
- Reload во время незавершённого Forward использует ожидающий URL, а повторный запуск ярлыка возвращает существующее окно без второго процесса с той же БД профиля.

### Новые возможности

- Developer Workspace с деревом выбранной папки, просмотром исходников, заметками/snippets, сетевыми метаданными и очищенным HAR.
- Ограниченный неинтерактивный запуск локальных команд с системным подтверждением, лимитом времени/вывода и без унаследованных произвольных переменных окружения. Это не полноценный терминал.
- Встроенный Tor для Windows x64: Expert Bundle 15.0.26, проверка OpenPGP и хэшей, daemon 0.4.9.14, bootstrap, временный профиль, circuit/identity/clear. Onion-переход требует согласия.
- All-frame Tor privacy guard без API-моста к Node/Electron, запрет локальных адресов/устройств в Tor и поведение без Direct fallback.
- Переключатели `/rain`, `/bokeh`, `/glass`, `/glow`, `/cinematic`, цвет Tor-вкладок, отключение parallax. Часы обновляются по минутам только на видимой стартовой странице.

### Проверки и ограничения

137 unit-тестов; новые E2E: core 6, UI 6, developer 3 и контролируемый SOCKS5 Tor isolation 1. Реальный Tor smoke достиг bootstrap 100%, загрузил собственный временный v3 onion-сервис, проверил основной документ/cross-origin iframe без WebRTC/Node/IPC, выполнил circuit request, заменил профиль при New Identity и остановил daemon. Артефакты: `artifacts/tor-network-smoke.json` и `artifacts/tor-owned-onion.png`. Итог полного набора и сборки: [TEST_REPORT.md](TEST_REPORT.md).

Остаются: подписание установщика, updater, all-platform Tor, полный DNS/WebRTC/IP аудит с захватом трафика, согласование лицензий Tor bundle, интерактивный PTY, расширения и полноценные workspace-контейнеры.

## 0.1.0 — 23 октября 2026

Первый рабочий Windows MVP: Chromium WebContentsView, вкладки, навигация, DevTools, история, закладки, загрузки, SQLite, восстановление сессии, профили, HTTP Proxy и London Rain. Историческая проверка выпуска: 60 unit и 13 E2E; эти числа не заменяют результаты 0.2.0.
