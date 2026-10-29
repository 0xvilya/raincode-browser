# Лицензии и происхождение компонентов

0.5.4: сцены Tokyo, New York, Paris, Cyber City, Deep Space, Forest, Mountain, Ocean, Sakura и minimal созданы как оригинальный локальный SVG-код в `src/renderer/ThemeScene.tsx`, распространяются с лицензией проекта. Внешних изображений, музыки, hotlink или новых сторонних библиотек для этих сцен не добавлено. London использует ранее документированный оригинальный asset.

Этот файл — указатель, не замена полных license/notice-файлов поставляемых зависимостей. Точные версии закреплены в `pnpm-lock.yaml`. При публикации бинарника нужно сохранять notices Electron/Chromium из соответствующей сборки и лицензии включенных библиотек.

## Основные компоненты

| Компонент         | Основная лицензия                                                | Где проверить                                                                        |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Electron          | MIT; Chromium и встроенные зависимости имеют собственные notices | `node_modules/electron/LICENSE`, `node_modules/electron/dist/LICENSES.chromium.html` |
| React / React DOM | MIT                                                              | `node_modules/react/LICENSE`, `node_modules/react-dom/LICENSE`                       |
| TypeScript        | Apache-2.0                                                       | `node_modules/typescript/LICENSE.txt`                                                |
| Vite              | MIT                                                              | `node_modules/vite/LICENSE.md`                                                       |
| Zustand           | MIT                                                              | `node_modules/zustand/LICENSE`                                                       |
| Lucide React      | ISC; сторонние иконки могут содержать отдельные notices          | `node_modules/lucide-react/LICENSE`                                                  |
| Zod               | MIT                                                              | `node_modules/zod/LICENSE`                                                           |
| Vitest            | MIT                                                              | `node_modules/vitest/LICENSE.md`                                                     |
| Playwright        | Apache-2.0                                                       | `node_modules/@playwright/test/LICENSE`                                              |
| ESLint            | MIT                                                              | `node_modules/eslint/LICENSE`                                                        |
| Prettier          | MIT                                                              | `node_modules/prettier/LICENSE`                                                      |
| electron-builder  | MIT                                                              | `node_modules/electron-builder/LICENSE`                                              |
| SQLite            | Public domain upstream; включена через Node.js                   | notices поставляемой версии Node/Electron                                            |
| @noble/hashes     | MIT                                                              | `node_modules/@noble/hashes/LICENSE`                                                 |
| OpenPGP.js        | LGPL-3.0+; инструмент подготовки Tor, dev dependency             | `node_modules/openpgp/LICENSE`, поле license в package.json                          |
| tar               | BlueOak-1.0.0; инструмент распаковки Tor, dev dependency         | `node_modules/tar/LICENSE.md`, поле license в package.json                           |

Подробные лицензии транзитивных зависимостей находятся в их каталогах и должны учитываться при сборке. Наличие MIT в этой таблице не меняет лицензию Chromium, шрифтов, иконок или иной вложенной зависимости.

## Визуальные материалы

Фоновая сцена создается специально для RainCode и поставляется локальным asset; внешние фотохостинги и hotlink не используются. Если присутствует сгенерированная иллюстрация, она не объявляется фотографией реальной улицы. Иконки и шрифты следует учитывать по фактически включенным пакетам; системные шрифты не распространяются вместе с приложением.

## Tor и Arti

В 0.3.0 включается официальный Expert Bundle **15.0.26 Windows x64**, executable сообщает **Tor 0.4.9.14**. Arti не включён. Архив проверяется OpenPGP и закреплённым fingerprint; происхождение и хэши находятся в `build/tor-bundle.json`. Проверка подписи устанавливает происхождение файла, а не меняет условия его распространения.

Полные upstream notices сохраняются без замены в `vendor/tor/win32-x64/docs` и копируются в `resources/tor/win32-x64/docs` сборки: `tor.txt`, `openssl.txt`, `libevent.txt`, `zlib.txt`, `lyrebird.txt`, `conjure.txt`. Архив включает Tor, geoip и pluggable transports; их наличие не означает, что transport UI RainCode реализован. Лицензия RainCode не заменяет лицензии любой части bundle.

**BSD по умолчанию и GPL-режим конкретного binary:** `docs/tor.txt` описывает базовую3-clauseBSD лицензию Tor, но подписанный executable сообщает GPL3. В официальном исходнике0.4.9.14 причина установлена: `configure.ac` поддерживает `--enable-gpl` для GPL-кода (в частности module-pow), а `src/app/config/config.c` печатает эту строку при `ENABLE_GPL`. Следовательно, базовая BSD-лицензия не определяет условия именно этой сборки. Это вывод из исходного условия и наблюдаемого binary, не независимая аттестация всех build flags. Перед публичным распространением остаётся подготовить полные соответствующие исходники/patches/build recipe именно Expert Bundle и обязательные license materials. Не объявляем весь bundle BSD/MIT.

Для целевого чтения использован [официальный source archive0.4.9.14](https://dist.torproject.org/tor-0.4.9.14.tar.gz):SHA256 `182449ac1c8ff43278da27b69b02040e11d03d0327db6d9126e4190ec6235e4a` совпал с опубликованным `.sha256sum`. Этот HTTPS checksum check не подменяет OpenPGP verification исходников и не доказывает полное соответствие собранному Expert Bundle. Архив только прочитан,не исполнялся.

Tor является товарным знаком The Tor Project. RainCode не является официальным Tor Browser, не связан с The Tor Project и не спонсируется им. Упоминания нужны для описания совместимости и ограничений. См. [политику Tor Project](https://www.torproject.org/about/trademark/).

## Исходный код RainCode

Собственный код RainCode распространяется по корневому [LICENSE](LICENSE): MIT, Copyright 2026 Vilya. Это не меняет отдельные условия Electron/Chromium, Node/SQLite, библиотек и Tor bundle. Публичная доступность репозитория сама по себе не заменяет лицензионные тексты и notices.
