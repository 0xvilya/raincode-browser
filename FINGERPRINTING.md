# Fingerprinting: модель и ограничения

Обновлено 24 октября 2026 года. RainCode не обеспечивает уровень anti-fingerprinting официального Tor Browser. VPN или Tor меняет сетевой маршрут; сайты по-прежнему могут сопоставлять поведение браузера и данные аккаунтов.

## Что реализовано

- Раздельные Chromium sessions для профилей; Private и Tor непостоянные.
- Управление permissions. Для Tor запрещены устройства и геолокация.
- В Tor privacy preload удаляет WebRTC/WebTransport API во всех кадрах при сохранённых sandbox/contextIsolation и отключённой интеграции Node в страницы. Подробные тесты и границы сетевых утверждений описаны в [TOR_MODE.md](TOR_MODE.md).
- Developer Workspace позволяет явно менять User-Agent и эмулировать viewport для отладки. Это инструменты совместимости, а не доказанная система маскировки личности.

Canvas/WebGL/audio/fonts, размер экрана, timezone/locale, CPU/GPU-поведение, client hints, workers, CSS media queries и наблюдаемое поведение не нормализованы согласованной fingerprinting-политикой. В браузере нет подтверждённой population-wide anonymity set. Даже полный запрет WebRTC не решает эти задачи.

## Почему не добавляется случайный spoofing

Изменение одной HTTP UA-строки не гарантирует согласования `navigator.userAgent`, Client Hints и API в workers/iframes. Chromium UA Reduction снижает точность некоторых пассивных полей, но high-entropy Client Hints могут дополнительно раскрывать данные. [Chromium UA Reduction](https://www.chromium.org/updates/ua-reduction/).

Официальный Tor Browser применяет согласованные меры, включая letterboxing и стандартизованные значения UA, чтобы уменьшать различия между пользователями. Случайные индивидуальные настройки могут, наоборот, сделать браузер заметнее. Наличие SOCKS-подключения не переносит эти изменения в Electron. [Tor Browser fingerprinting protections](https://support.torproject.org/tor-browser/features/fingerprinting-protections/).

RainCode не подделывает результат privacy-тестов, не обещает стопроцентную анонимность и не выдаёт developer overrides за защиту. JavaScript hooks могут быть обнаружимыми; отсутствие свойства в главном документе не доказывает отсутствие обхода в другом realm или worker.

## Следующий этап реализации

1. Добавить внутреннюю страницу с реальными измерениями текущего профиля и понятными ограничениями. Диагностика выполняется локально; публичные fingerprinting-сервисы не открываются без запроса пользователя.
2. Создать controlled fixture, сравнивающий HTTP User-Agent/Accept-Language/Client Hints и соответствующие JS-поля. Покрыть top-level, same-origin/cross-origin iframe, srcdoc, dedicated/shared workers и service worker.
3. Измерять Canvas, WebGL, audio, fonts, screen/DPR, timezone/locale и media queries без сохранения полного fingerprint в обычной истории или логах. Отчёт экспортируется только явно и предупреждает о чувствительности данных.
4. Отдельно проектировать согласованные профили защиты с оценкой совместимости и отличимости. Letterboxing требует синхронизации реального viewport, reported screen, zoom и accessibility; декоративные поля вокруг страницы не доказывают защиту.
5. Тестировать navigation, новый realm, восстановление session, crash/reload, fullscreen, OS scaling и обновление Electron. Публично заявлять только проверенные свойства, без процентной оценки анонимности по одному онлайн-тесту.

При критичной необходимости анонимности рекомендуется официальный Tor Browser. Логин в личный аккаунт и добровольная передача идентифицирующих данных связывают сессию с пользователем независимо от сетевого режима и интерфейсных настроек.
