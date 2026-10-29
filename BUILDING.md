# Сборка RainCode Browser 0.3.0

## Требования

- Node.js 24+ и pnpm 11.25.0.
- Windows x64 для текущей проверенной сборки и встроенного Tor.
- Во время подготовки: npm/Electron/build tools, `dist.torproject.org` и `openpgpkey.torproject.org`.
- Сертификат подписи нужен отдельно; он не включён в репозиторий. macOS DMG/notarization требует macOS runner, Linux пакеты — соответствующего runner.

## Подготовка и dev

```powershell
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm tor:prepare
pnpm dev
```

Electron binary устанавливается postinstall через официальный `node_modules/electron/install.js` с checksum verification. Если его установка не выполнилась:

```powershell
node node_modules/electron/install.js
```

`pnpm tor:prepare` получает Expert Bundle 15.0.26 Windows x64, detached signature и ключ, проверяет закреплённый fingerprint/OpenPGP, безопасно распаковывает и записывает manifest/file hashes. Версия и хэши находятся в `build/tor-bundle.json`. Перед изменением pin нужен review; не заменяйте проверку подписи одним новым checksum.

`vendor/tor` и cache не входят в Git. На чистом checkout подготовка необходима перед полной проверкой и упаковкой. Без bundle интерфейс сообщает, что Tor недоступен; код не скачивает его при запуске браузера. При новом запуске prepare используются сеть для подписи/ключа и кэшированный либо загруженный архив.

## Проверки

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm format:check
```

`pnpm verify` последовательно выполняет lint, typecheck, unit, build и все E2E. Он не включает format check, production installer или реальный Tor network smoke.

E2E запускает настоящий Electron с временным userData, sandbox не выключается. Большинство сетевых сценариев использует контролируемые local HTTP/proxy fixtures. Tor isolation E2E проверяет production policy через собственный SOCKS5 fixture, а не публичную сеть Tor.

Реальный сетевой smoke запускается отдельно после build и подготовки bundle:

```powershell
node scripts/tor-network-smoke.mjs
```

Он явно запускает Tor, создаёт собственный временный v3 onion-сервис, публикует descriptor, открывает страницу в RainCode и проверяет main/cross-origin frame, circuit/identity/stop. Требуется доступ к публичной сети Tor; запуск может занять несколько минут и зависит от сети. Он не открывает неизвестные onion-сайты. Результаты — `artifacts/tor-network-smoke.json` и `artifacts/tor-owned-onion.png`; временный адрес не является пользовательским сайтом. Тест не заменяет DNS/IP packet capture.

## Production Windows

```powershell
pnpm build
pnpm start
pnpm package
pnpm dist
```

- `build`: Vite в `dist`, esbuild main/shell preload/Tor guard в `dist-electron`.
- `start`: запуск собранного приложения через Electron.
- `package`: `release/win-unpacked/RainCode Browser.exe` и ресурсы.
- `dist`: `release/RainCode Browser Setup 0.3.0.exe`, NSIS с выбором папки и ярлыком.

Bundle копируется в `resources/tor/win32-x64` вместе с manifest, geoip и полными upstream docs/notices. Runtime сверяет хэши до запуска. Installer и executable пока не подписаны; updater отсутствует. Не отключайте системные защитные механизмы для сборки.

macOS/Linux targets присутствуют в electron-builder, но текущая проверка не доказывает их работоспособность. Tor integration пока только Windows x64; перенос требует собственных pinned bundle и тестов. До публичного распространения проверьте расхождение лицензии Tor executable/notices, описанное в [LICENSES.md](LICENSES.md).

## Окружение и данные

- `RAINCODE_DEV_URL` — локальный Vite renderer, только непакетная разработка.
- `RAINCODE_USER_DATA` — отдельный userData для непакетных E2E.
- `RAINCODE_TEST` — отметка тестового окружения, не разрешение ослабить TLS/sandbox.

Не публикуйте userData, SQLite, cookies, runtime Tor cookies, downloads, tokens и secrets. Папки build output/cache/artifacts исключены из Git; храните нужные проверочные артефакты отдельно. Итоговый статус установки, ярлыка, подписей и сборки: [PROGRESS.md](docs/release-validation.md), [TEST_REPORT.md](docs/release-validation.md).
