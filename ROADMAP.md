# ROADMAP — после 0.2.0

Реализованные функции и результаты проверок перечислены в README/TEST_REPORT. Здесь только оставшаяся работа; наличие UI или upstream API не означает завершённую функцию.

## Приоритет: стабильность и выпуск

- Полный Windows regression после каждого обновления Electron: Omnibox/composition/AltGr, navigation timeline, sessions, permissions, DevTools target, закрытие WebContents.
- Проверки системного IME, Windows DPI 100/125/150/200%, screen readers, high contrast и клавиатуры на разных layouts.
- Длительные замеры startup/RAM/CPU/GPU, многовкладочная нагрузка, crash/power-loss восстановления SQLite.
- Регистрация default-browser/protocol handlers и передача выбранных пользователем URL из ОС. Повторный запуск с тем же userData уже возвращает существующее окно через single-instance lock.
- Подписанные Windows installer/executable, macOS notarization и проверенный updater с защитой от downgrade.
- CI для Windows/macOS/Linux; сейчас фактическая GUI/сетевая проверка и встроенный Tor относятся к Windows x64.
- Независимый аудит IPC, файлового доступа, permissions и supply chain.
- Завершить согласование условий распространения конкретного Tor bundle и соответствующих исходников: notices говорят BSD, executable сообщает GPL. Не выдавать весь bundle за MIT/BSD.

## Experimental Tor: следующий gate

Уже есть официальный проверенный bundle, lifecycle/control/bootstrap, отдельная session, circuit/identity/clear, SOCKS fail-closed и v3 navigation. Реальный smoke подтвердил bootstrap 100%, загрузку собственного onion, отсутствие Node/bridge/WebRTC в main/cross-origin frame и операции identity/stop. Это не сертификация всех утечек.

Осталось:

- DNS/IP/UDP/STUN packet capture на целевых ОС, включая workers, service workers, WebSocket, redirects, downloads, crash/kill daemon и сетевые изменения.
- Дополнительные all-frame/WebTransport регрессии при обновлении Electron; Tor-only `nodeIntegrationInSubFrames` требует постоянной проверки sandbox/Node isolation.
- Windows child-process crash/forced shutdown и очистка runtime-каталогов после аварии.
- Подписанные и проверенные bundle для macOS/Linux/других архитектур.
- Bridges/transports с явной конфигурацией; их наличие в upstream архиве не означает готовую UI-интеграцию.
- Рассмотреть более сильное разделение Tor в отдельный процесс/сетевой sandbox и SAFECOOKIE challenge; сейчас control использует локальный cookie AUTHENTICATE.
- Повторяемый сетевой smoke с собственным временным onion, без зависимостей от случайных сайтов и без обещания постоянной доступности публичной Tor-сети.

Tor останется экспериментальным и после этих работ: fingerprinting-защита официального Tor Browser не реализована.

## UX и производительность

- Автоматические sleeping/discard policy и Task Manager с измерениями на длительной нагрузке; ручной sleep уже существует.
- Виртуализация больших списков, доступный поиск/группы вкладок и переназначаемые shortcuts.
- Настройка глубины parallax, количества bokeh, цвета акцента/blur вместо только существующих переключателей.
- Полный keyboard/screen-reader аудит всех внутренних страниц и 14 разделов Dev Panel.
- Необязательная погода только после согласия и явного выбора города.

## Developer Workspaces

Уже реализованы выбранная папка, tree/source viewer, notes/snippets с подтверждением, выбор страницы для DevTools, ограниченный HAR и command runner. Это не полный IDE или терминал.

- Интерактивный PTY с терминальным UI, безопасным lifecycle и явной границей доверия; текущий runner ограничен временем/выводом.
- Индивидуальные workspace containers/project/layout/DevTools/env metadata. Сейчас пространства одного profileId разделяют cookies/storage, папка проекта не является отдельным контейнером.
- Scoped пользовательские headers и userscripts с origin permissions, auto reload.
- API/JSON/XML viewers, более полный redaction/review экспорта сети. Полные headers, bodies и WebSocket уже доступны в штатном Chromium DevTools.
- Дополнительные тесты race/смены проекта и безопасного управления локальными процессами.

## Приватность, Proxy и расширения

- Third-party cookie policy, правила хранения по сайту и выборочная очистка категорий на выходе.
- Proxy authentication через системный keychain; не сохранять пароль в URL/SQLite/plaintext export.
- Контролируемые HTTPS proxy и SOCKS5 proxy матрицы для всех ОС. Tor SOCKS isolation fixture не является проверкой любого пользовательского proxy.
- Полный аудит общего DNS/DoH resolver и Chromium background connections.
- Управление совместимыми unpacked extensions: manifest/permissions review, подтверждение, отключение/удаление. Chrome Web Store parity не обещается, автозагрузки нет.

## Критерий готовности

Функция выполняет заявленное действие, выдаёт понятную ошибку, сохраняет границы безопасности и проверена подходящим запуском/тестом. Незавершённая функция скрыта или явно помечена Planned. Отчёт должен различать unit/fixture E2E, реальный network smoke и независимый сетевой аудит.
