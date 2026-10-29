# Безопасность RainCode Browser

0.5.5 Page Context extends the AI boundary: native read grants before any isolated-world read; actual visible Direct same-profile source and native document identity checked before/after collection and confirmation. Collector code is constant, takes no page/user script, limits1500nodes/depth32/text3000/structure1500 and3s wait. Output is runtime validated; exact preview <=8192chars/16384UTF8bytes. Upload requires reviewed ticket(s), expires60s and is one-use; cloud also requires a native confirmation. Navigation/close/crash/profile change/Stop/lock/revoke invalidate grants/tickets and abort context-bound requests. Only textual page excerpts are implemented. This is best-effort redaction and a no-tools data boundary, not proof of perfect secret detection or prompt-injection resistance.

0.5.4 AI boundary: typed shell-only IPC; provider config excludes plaintext key, key stored via existing OS vault. Transport uses the selected profile's Electron Session with credentials omitted, redirect:error, byte/time limits and cancellation. Direct profiles only; Tor/Proxy/private AI requests fail closed. No Node.fetch fallback. API error bodies are not displayed or logged. No tools, file execution, page collection or screen capture are exposed by the text chat. Pure document consent/preview gate is present for future collectors, but no claim of AI Vision implementation is made. Electron documents Response.url as incorrect; transport retains the validated request URL only because redirects are refused and a controlled redirect test verifies non-following.

JavaScript site policy is a native WebContents creation preference. Cross-policy navigation recreates the page context and respects beforeunload cancellation; applying global privacy controls explicitly closes old contexts/connections after a UI warning. HTTP/WebSocket cookie-header filtering is bounded network protection, not complete storage partitioning. Sandbox/contextIsolation/webSecurity/TLS/site isolation remain enabled; no permissive Chromium flags were added for these features.

RainCode — экспериментальный desktop-браузер, а не прошедший независимый аудит защищенный браузер. Смотрите [модель угроз](THREAT_MODEL.md) и [статус Tor](TOR_MODE.md).

## Границы привилегий

Удаленные сайты открываются в `WebContentsView`. Они не получают Node.js или preload API оболочки. Для интерфейса и сайтов включены `contextIsolation`, `sandbox`, `webSecurity`; отключена интеграция Node.js. Chromium sandbox, Site Isolation и TLS-проверка не выключаются. Приложение не принимает недоверенный сертификат автоматически.

IPC доступен только доверенному главному фрейму локального интерфейса. Главный процесс проверяет отправителя, использует allowlist команд и Zod-схемы. Developer Workspace разрешает читать только явно выбранный проект; пути проверяются против обхода и symlink. Неинтерактивная команда PowerShell требует отдельного системного подтверждения каждого запуска, ограничена временем и выводом. Сайты не имеют доступа к этим API. Навигация ограничена разрешенными схемами; адреса с credentials и опасные схемы отклоняются. Открытие внешнего обработчика требует подтверждения.

Интерфейс загружается с локальными assets и CSP. Данные страницы отображаются как текст, не вставляются как доверенный HTML. Настройки прокси не допускают встраивания пароля в URL. Неподдерживаемое хранение секретов не подменяется записью plaintext-пароля.

## Разрешения и загрузки

Разрешения запрашиваются с указанием origin. Камера и микрофон имеют разные решения: сохранённое разрешение аудио не разрешает видео автоматически. Неизвестные разрешения не выдаются автоматически. Сохраненные решения можно отозвать. ОС может отдельно запросить доступ к микрофону или камере. USB, serial, Bluetooth и screen capture в текущей версии отклоняются; аппаратные chooser API требуют дополнительной реализации и не считаются поддержанными только потому, что есть общий permission handler.

Загрузки не исполняются автоматически. Сохранение выбирается пользователем; потенциально исполняемые форматы требуют отдельного предупреждения. Сохранение страницы не дает сайту произвольного доступа к файловой системе. MVP не включает полноценный сервис репутации загрузок Chrome Safe Browsing, антивирус или песочницу внешних приложений.

## Обновления и поставка

Автоматического updater в MVP нет: отсутствует канал, через который приложение молча скачивает и запускает код. Пользователь обновляет сборку вручную. Это означает необходимость своевременного обновления Electron самим сопровождающим проекта.

Перед публичным производственным распространением нужны подпись Windows, macOS signing/notarization, проверенный канал обновлений, защита от rollback/downgrade и независимый аудит. Неподписанная локальная сборка может вызвать системное предупреждение. Нельзя отключать проверку сертификатов или sandbox ради устранения такого предупреждения.

`pnpm install --frozen-lockfile` использует закрепленный lockfile. Установка зависимостей может выполнять разрешенный код поставщиков, поэтому обновления lockfile и allowlist install scripts подлежат review. Секреты, пользовательская БД, cookies, downloads и локальные profiles не должны попадать в Git. `pnpm tor:prepare` скачивает официальный Expert Bundle при подготовке сборки, проверяет OpenPGP-подпись и закреплённый fingerprint. Во время работы браузера компоненты не скачиваются; перед запуском проверяются закреплённые хэши всех файлов и отсутствие внедрённых файлов. Произвольный путь к исполняемому Tor не принимается через IPC.

Tor использует отдельную временную Chromium session с SOCKS5 без DIRECT fallback и запретом разрешений. `nodeIntegrationInSubFrames` включён только для Tor, чтобы Electron запускал sandboxed preload во всех кадрах; `nodeIntegration: false`, `sandbox: true`, `contextIsolation: true` сохраняются. E2E проверяет отсутствие `process`, `require`, API оболочки и WebRTC в основном кадре, cross-origin iframe и srcdoc. Это экспериментальная настройка Electron, требующая повторной проверки при обновлении runtime. Смотрите ограничения fingerprinting и сетевых проверок в TOR_MODE.md.

## Сообщение об уязвимости

Не публикуйте токены, cookies, личные URL, дампы пользовательского профиля и рабочие эксплойты против чужих систем. Если в GitHub-репозитории включено private vulnerability reporting, используйте раздел Security → Report a vulnerability. Иначе сначала свяжитесь с владельцем репозитория и запросите приватный канал. Проект пока не обещает SLA или bug bounty.

В полезный отчет входят версия приложения/Electron/ОС, минимальный локальный сценарий, ожидаемый и фактический результат и обезличенные логи. Подтверждайте проблему на отдельном тестовом профиле.

Базовые рекомендации взяты из [официального security guide Electron](https://www.electronjs.org/docs/latest/tutorial/security), но выполнение списка рекомендаций само по себе не является аудитом.

# Дополнение 0.3.1: транспорт и settings IPC

Дополнение0.4.0: команды Console сохраняют native default-deny подтверждение и выбор папки. Отмена имеет выделенный проверенный IPC-путь мимо очереди выполнения, увеличивает approval generation и завершает только процессы runner. stdout/stderr декодируются раздельными UTF8 StringDecoder; Windows PowerShell явно использует UTF8. Команды ограничены4096символами/15s, вывод64K UTF16-символами. Clipboard.write доступен лишь sender-validated оболочке, строка до1MiB; у сайтов Node/IPC отсутствуют. Kill Switch cleanup выполняется до необязательного обновления косметики.

IP/ASN: никакого session.resolveHost в Tor/Proxy/onion. Explicit RIPEstat lookup принимает только публичный IP, fixed HTTPS host/endpoints, bounded timeout/streamed bytes, без follow redirects/cookies. Ответ описывает сетевой анонс/владельца, не раскрывает защищённый origin onion/CDN. DNS/packet certification по-прежнему PARTIAL.

HTTPS-only включён по умолчанию в сетевых sessions профилей. Единый `webRequest.onBeforeRequest` сначала применяет Kill Switch, offline и Tor gates, затем переводит публичный HTTP GET/HEAD на HTTPS до отправки запроса. Остальные HTTP-методы и публичный `ws://` блокируются, без plaintext fallback; сайт должен использовать `wss://`. TLS/certificate validation не отключаются. Явное включение закрывает существующие page realms, загрузки, соединения и session workers; вкладки требуют ручного обновления без повторной отправки форм.

Исключения — loopback/localhost для разработки и корректный onion v3 внутри Tor (его транспорт уже end-to-end encrypted). Не освобождаем LAN/похожие имена от политики. Это не VPN: DNS в режиме system, сообщения HTTP-прокси/CONNECT, трафик ОС, явно запускаемые локальные инструменты и все возможные не-HTTP протоколы не покрываются обещанием шифрования. Настройка DoH отдельная и выбирается пользователем. Полный OS packet audit ещё не выполнен.

Исправлен найденный при ревизии дефект Zod defaults: `settingsSchema.partial()` мог внедрять networkKillSwitch=false в unrelated IPC patch. Полная схема с defaults теперь используется только для миграции/полных настроек; IPC patch удаляет defaults и принимает только переданные поля. Есть unit и живой Electron regression с активным Kill Switch.

Основание политики: [Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request) и [Tor onion services](https://support.torproject.org/tor-browser/features/onion-services/). Автоматический audit не заменяет независимый аудит или аттестацию отсутствия уязвимостей.
