# Модель угроз RainCode Browser 0.2.0

Обновлено 24 октября 2026 года. Это описание границ защиты и остаточных рисков, а не независимый аудит или гарантия анонимности.

## Активы и границы доверия

Защищаем cookies, данные сайтов, историю/закладки, разрешения, локальные файлы и конфигурацию соединения. Сайт, его фреймы, dev-сервер, расширение и скачанный документ недоверенные. Профили разделяют session, но работают под одной учётной записью ОС.

Main доверенный: владеет WebContents, SQLite, IPC и локальными действиями. Shell имеет ограниченный preload. Страницы не получают API оболочки. В Tor есть отдельный минимальный all-frame privacy preload без публикуемого bridge.

## Угрозы, меры, остаточный риск

| Угроза                    | Меры                                                                                                                                 | Остаточный риск / проверка                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS leaks                 | Onion запрещён вне Tor, не отправляется поиску; resolver rules блокируют обычное разрешение onion, SOCKS5 передаёт hostname          | SOCKS E2E подтвердил domain ATYP=3. Это не захват всех DNS-пакетов; DoH, workers и служебные обращения требуют отдельного наблюдения                                                                     |
| WebRTC leaks              | `disable_non_proxied_udp`; Tor preload удаляет WebRTC/WebTransport во всех фреймах; Tor permissions запрещены                        | Проверены main, cross-origin и srcdoc в E2E, main/cross-origin в реальном onion. Нужен packet capture UDP/STUN и повторная проверка новых Chromium/API                                                   |
| Browser fingerprinting    | Явное предупреждение об ограничениях; нет заявлений о полной анонимности                                                             | Шрифты, GPU, canvas, язык, размеры, часы, аккаунты могут связывать посещения. RainCode не унифицирует fingerprint как Tor Browser                                                                        |
| Malicious renderer        | Sandbox, context isolation, Node выключен, shell IPC недоступен сайтам                                                               | Chromium sandbox escape остаётся риском. Tor-only `nodeIntegrationInSubFrames` нужен для guard: sandbox=true и nodeIntegration=false сохраняются, отсутствие Node/bridge проверено, но требует регрессий |
| Compromised extension     | Автоустановки нет, загрузка extensions в текущем MVP не реализована                                                                  | Будущая интеграция должна учитывать host permissions и согласие; не включать extensions в Tor автоматически                                                                                              |
| IPC abuse                 | Allowlist, Zod, sender/frame проверка, очередь команд; нет универсального shell API для сайтов                                       | XSS доверенной оболочки опаснее XSS сайта. Команды разработчика имеют права пользователя, поэтому требуют native consent                                                                                 |
| Local malware             | Проверки путей, отсутствие секретов в обычных логах, ограниченная выдача IPC                                                         | SQLite не зашифрована; администратор, malware, swap и backups вне гарантий. Изменение всего неподписанного приложения может изменить pins                                                                |
| Supply-chain attack       | Lockfile, обзор зависимостей, checksum Electron, OpenPGP Tor archive с pinned signer, runtime file hashes, безопасная распаковка     | Подписи RainCode/updater отсутствуют. Зависимость или build host может быть скомпрометирован. Pin update — отдельный review; не «latest» из сети                                                         |
| Unsafe downloads          | Выбор места, предупреждение опасного расширения, нет автозапуска                                                                     | Это не antivirus/репутационная Safe Browsing база. Пользователь может запустить опасный файл                                                                                                             |
| Tor process compromise    | Фиксированный проверенный executable, spawn без shell, loopback SOCKS/control, cookie authentication, временные каталоги, stop/clear | Используется cookie AUTHENTICATE, не SAFECOOKIE challenge. Локальный malware может читать cookie; daemon compromise не исправляется proxy policy                                                         |
| Permission confusion      | Origin/type prompts, once/site/deny, отзыв; неизвестные API не выдаются автоматически                                                | Аппаратные и OS-specific разрешения требуют дополнительных ручных тестов. В Tor permissions запрещены                                                                                                    |
| Profile mixing            | Direct/Proxy/Private/Tor sessions разделены, Tor никогда не конвертирует Direct; Tor identity заменяет профиль                       | Workspaces с одним profileId делят storage. Notes/bookmarks/snippets являются общими сохраняемыми данными                                                                                                |
| Malicious navigation      | URL/scheme allowlist, credential URLs запрещены; внешние протоколы только с согласием, TLS не обходится                              | Новые Chromium schemes и redirects требуют регрессий; внешняя программа после согласия вне sandbox RainCode                                                                                              |
| Local project abuse       | Явный выбор папки, canonical path/size checks, symlink/junction/path traversal отказ                                                 | Файлы могут меняться локально, выбор папки не защищает от local malware                                                                                                                                  |
| Command/snippet confusion | Явный target, native consent, ограниченные time/output/env; navigation change отменяет snippet                                       | Команда выполняется как пользователь и может читать/удалять его файлы. Это осознанный command runner, а не sandbox или PTY                                                                               |

## Tor-прокси и Tor Browser

Tor daemon переносит сетевые потоки; не исправляет fingerprint, действия пользователя или ошибки ОС. SOCKS5 на loopback сам по себе не превращает Electron в Tor Browser. Даemon должен соединяться с relays; исключать необходимо прямые соединения браузера с назначениям и утечки их имён.

В 0.2.0 проверены реальный daemon bootstrap, собственный временный v3 onion, API isolation в основном документе/cross-origin iframe, circuit request, identity replacement и stop. Контролируемый SOCKS E2E дополняет эту проверку fail-closed и передачей hostname. Отсутствие всех DNS/WebRTC/IP-утечек без packet capture не заявляется.

## Проверяемые инварианты

1. Сайт и Tor iframe не видят `require`, `process` или `window.raincode`.
2. Неизвестный IPC, чужой sender/frame и некорректные payload отклоняются.
3. Закрытие уничтожает WebContents; URL не превращается в доступ к локальному файлу.
4. Onion-адрес не уходит обычному поиску/Direct DNS и не включает Tor скрытно.
5. Неисправный proxy/Tor не переключает соответствующий профиль на Direct.
6. Sessions не переносят cookies автоматически. Private/Tor исключены из постоянного session restore/history.
7. Локальная команда/snippet требует native consent и не доступна веб-странице.
8. Runtime verification обнаруживает подмену bundle относительно pinned manifest; она не защищает от замены всего приложения.
9. Успешный тест API/fixture/сборки не равнозначен независимому сетевому аудиту.

## За пределами гарантии

Нет защиты от глобального наблюдателя, локального администратора, malware, входа в личный аккаунт, восстановления данных из SSD/backups или уязвимости ОС. Нет обещания отсутствия всех сетевых утечек и fingerprinting. Торговая марка Tor и официальный Tor Browser принадлежат The Tor Project; RainCode — отдельный продукт.
