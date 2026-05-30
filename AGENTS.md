# Bookbookbook Agent Guide

이 저장소는 두 가지 실행 방식을 함께 관리한다.

- `pages/`: GitHub Pages에 배포되는 브라우저 전용 정적 앱
- `local-package/`: 기존 Python 로컬 서버 버전
- `desktop/`: `pages/` 빌드를 로컬 macOS 앱과 DMG로 포장하는 Electron 버전

## 기본 판단

- 새 사용자에게는 `pages/` 정적 앱을 우선 안내한다. 설치 없이 `https://hyun2xyz.github.io/bookbookbook/`에서 바로 쓰는 방식이다.
- PDF 개인정보가 중요하다는 점은 계속 강조한다. `pages/` 방식은 PDF를 서버로 업로드하지 않고 브라우저 안에서 처리한다.
- Python 기반 오프라인/로컬 서버가 필요할 때만 `local-package/`를 안내한다.
- 사용자가 DMG나 로컬 앱을 원하면 `desktop/`을 안내한다. 이 방식은 서버를 띄우지 않고 `pages/dist`를 앱 안에서 로컬 파일로 연다.

## pages 정적 앱

- 위치: `pages/`
- 핵심 라이브러리: `pdf-lib`, `pdfjs-dist`
- 개발 도구: `vite`, `vitest`, `playwright`
- npm은 `pages/` 안에서만 사용한다.
- 사용자가 Pages에서 바로 쓰는 앱이므로 백엔드 서버, `127.0.0.1`, Python 설치를 요구하지 않는다.

주요 명령:

```bash
cd pages
npm install
npm test
npm run build
npm run smoke
```

검증 기준:

- `npm test`가 imposition/PDF engine 단위 테스트를 통과해야 한다.
- `npm run build`가 TypeScript와 Vite production build를 통과해야 한다.
- `npm run smoke`가 브라우저에서 PDF 선택, 미리보기, 변환, 다운로드 PDF 검증까지 통과해야 한다.

배포:

- `pages/dist/` 내용을 `gh-pages` 브랜치 루트에 배포한다.
- 배포 후 `https://hyun2xyz.github.io/bookbookbook/`에서 새 HTML/JS가 내려오는지 확인한다.

## local-package Python 버전

- 위치: `local-package/`
- 핵심 패키지: `pypdf`
- Homebrew 패키지: `git`, `python`, `poppler`
- `poppler`는 PDF 미리보기용 `pdftoppm`을 제공한다.
- `.venv/`, `work/`, `output/*.pdf`는 커밋하지 않는다.

주요 명령:

```bash
cd local-package
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
PYTHONPATH=src python -m unittest discover -s tests -v
./run_app.sh
```

## desktop macOS 앱

- 위치: `desktop/`
- 핵심 패키지: `electron`, `electron-builder`
- `pages/dist/`를 Electron 앱의 `renderer/`로 포함한다.
- 보안 설정은 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`를 유지한다.
- macOS 앱은 ad-hoc 서명으로 로컬 검증을 통과하게 만들지만, 공개 배포용 notarization은 별도 Apple Developer ID가 필요하다.

주요 명령:

```bash
cd desktop
npm install
npm run smoke
npm run dist
```

검증 기준:

- `npm run smoke`가 Electron 앱에서 PDF 선택, 분석, 변환을 통과해야 한다.
- `npm run dist`가 `desktop/dist/Bookbookbook-1.0.0.dmg`를 만들어야 한다.
- DMG는 `hdiutil verify desktop/dist/Bookbookbook-1.0.0.dmg`로 검증한다.

## 문서 관리

- README 맨 위 이미지는 `assets/bookbookbook.png`를 유지한다.
- 저장소 이름과 clone URL은 `hyun2xyz/bookbookbook` 기준으로 유지한다.
- 설치가 필요 없는 기본 경로는 `pages/` 방식이다.
- 설치 설명을 바꾸면 `README.md`, `AGENTS.md`, `pages/package.json`, `local-package/requirements.txt`가 서로 충돌하지 않는지 확인한다.
- 실제 고객 PDF나 개인 파일을 샘플로 커밋하지 않는다.
