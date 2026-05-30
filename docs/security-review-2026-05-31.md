# Bookbookbook security review, 2026-05-31

## Scope

- `pages/`: GitHub Pages static app and browser PDF conversion flow.
- `desktop/`: Electron desktop wrapper and DMG packaging.
- `local-package/`: legacy Python localhost server.

## Checks run

- `npm audit --audit-level=moderate` in `pages/`: 0 vulnerabilities.
- `npm audit --omit=dev` in `pages/`: 0 vulnerabilities.
- `pip-audit -r local-package/requirements.txt`: no known vulnerabilities.
- `npm audit --audit-level=moderate` in `desktop/`: 0 vulnerabilities.
- Secret pattern scan over committed source paths, excluding build/output folders: no real secrets found.
- Browser smoke test: local PDF upload, preview, conversion, and PDF download path passed.
- Electron smoke test: packaged app loaded and converted a local PDF.
- DMG verification: `hdiutil verify desktop/dist/Bookbookbook-1.0.0.dmg` passed.
- DMG mount check: `Bookbookbook.app` inside the DMG passed `codesign --verify --deep --strict`.

## Findings

### Good

- The main Pages app does not upload PDFs to a server. It reads PDFs with browser file APIs, analyzes them locally, and creates a download Blob locally.
- The main Pages app has no API key, token, or server-side credential surface.
- The Electron app loads the same static renderer from local files. It does not start a web server.
- Electron is configured with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, all permission requests denied, and external navigation restricted to `https://` URLs opened in the default browser.

### Fixed

- The legacy Python localhost server previously allowed `Access-Control-Allow-Origin: *` with private network access. That meant any website could ask a browser to call a running local Bookbookbook server.
- The server now only sends CORS/private-network headers for:
  - `https://hyun2xyz.github.io`
  - `http://127.0.0.1:8765`
  - `http://localhost:8765`
- Requests with other `Origin` headers are rejected with `403`.

### Residual risk

- The DMG is ad-hoc signed, not Developer ID signed or notarized. It verifies locally, but macOS Gatekeeper may still warn users when the app is downloaded from the internet.
- PDF parsing happens client-side with `pdf-lib` and PDF.js. Dependency audits are clean today, but PDF parsers should be kept updated because PDFs are complex untrusted input.
- The legacy Python server still writes uploaded PDFs to local `work/` and `output/` folders while it is running. It is localhost-only and CORS-restricted now, but the static Pages app and Electron DMG are the safer default paths.
