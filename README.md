# RainCode Browser 0.5.23

A Chromium/Electron browser with a calm Rain interface, local AI connections, developer tools and explicit privacy controls.

[My Projects](https://0xvilya.github.io/my-projects/) · [Validation](docs/release-validation.md) · [Security policy](SECURITY.md) · [Roadmap](ROADMAP.md)

**Source preview.** This is not a signed stable binary release. Do not rely on RainCode for Tor Browser-level anonymity.

![Rain Tokyo scene](public/scenes/tokyo-rain-v1.png)

## Available features

- Tabs, keyboard navigation, history, bookmarks, session restoration and independent split panes
- Rain Shield: privacy presets, scoped site permissions, tracking controls, network monitor, proxy profiles and diagnostics
- Separate Direct, Proxy, Private and Tor sessions with fail-closed rules for protected routes
- Local password vault using OS-protected secrets, explicit save/fill consent and profile isolation
- One AI panel for Ollama and compatible endpoints, explicit page-context preview and cloud consent
- Chromium DevTools for the selected page, source viewing and a bounded local developer workspace
- Twelve bundled artistic scenes, custom interface colors, motion/quality controls and reduced-motion support

Website content never receives the shell's privileged API. Renderer sandbox, context isolation, TLS validation and Chromium site isolation remain enabled. See [Architecture](ARCHITECTURE.md) and [Threat model](THREAT_MODEL.md).

## Platform status

| Platform | Current status |
| --- | --- |
| Windows x64 | Local unsigned preview built and tested; no public installer yet |
| macOS | Native installer not built or validated |
| Linux | Native installer not built or validated |

Public binary distribution is blocked by publisher signing and completion of the Tor GPL corresponding-source/build materials. A signed updater and rollback are not implemented. Do not substitute nonexistent download URLs.

## Run from source

Use Node.js 24+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The default browser works without downloading Tor. To prepare the pinned official Tor Expert Bundle on Windows x64, run `pnpm tor:prepare`; signature and integrity checks are mandatory. The runtime is not committed here. No automatic runtime/model download occurs merely by opening RainCode.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm exec vitest run --exclude tests/tor/tor-integrity.test.ts
pnpm build
```

The source-only command excludes four bundle integrity tests that require the separately downloaded Tor runtime. After preparing that runtime on Windows, `pnpm verify` runs the full local verification, including Electron E2E tests. CI checks source on Windows, macOS and Linux; it does not certify native installers or OS-wide leak resistance.

Local 0.5.23 results: **453 unit tests, 93 Electron E2E tests and 3 packaged Windows UI tests passed**. See the [validation report](docs/release-validation.md) for method limits. The published snapshot has a [SHA-256 file manifest](SOURCE_MANIFEST.json).

## Privacy limits

No absolute anonymity, population-level fingerprint indistinguishability or full de-Googling is claimed. Canvas/font/Audio/WebGPU standardization, OS packet auditing, full screenshot/live AI Vision and several requested ecosystem tools remain incomplete. An IP change or a proxy is not a new identity. Visited websites can contact their own third-party services. Use the official Tor Browser when its anonymity model is required.

AI access is permission-scoped. Private/Tor context is blocked by default. Automatic secret redaction has limits: inspect every preview before sending. See [Privacy](PRIVACY.md), [Fingerprinting](FINGERPRINTING.md), [Tor](TOR_MODE.md) and [Google-service audit limits](ZERO_GOOGLE.md).

## Contributing and licensing

[Contributing](CONTRIBUTING.md) · [Build details](BUILDING.md) · [Changelog](CHANGELOG.md)

RainCode application source: [MIT](LICENSE). Third-party components and artwork have separate notices in [LICENSES.md](LICENSES.md), [ASSETS.md](ASSETS.md) and [scene provenance](public/scenes/PROVENANCE.md). The scenes are original AI artwork, not documentary photographs. Publishing this source does not authorize redistribution of an incomplete Tor binary/source bundle.
