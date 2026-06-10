![Bookbookbook](assets/bookbookbook.png)

[업데이트 노트 v1.0.8](docs/release-notes-1.0.8.md)

[App Store 출시 체크리스트](docs/app-store-release.md)

Bookbookbook(북북북 쓰다듬기)는 PDF로 뽑은 파일을 중철 출력용 PDF로 바꿔주는 도구입니다.

```
안녕하세요, 현입니다.

저는 한국에서 편집디자인을 공부하며 AI를 활용한 다양한 파이프라인을 연구하고,사람들과 공유하는 일을 하고 있어요.
월드와이드웹의 공유 철학과 Html, 유머 그리고 글짓기를 사랑합니다.

이건 소책자를 만드는 웹 사이트인데요,
제가 인디자인에서 소책자 인쇄를하거나 아크로벳 에서 중철 인쇄용으로 변환 하다가 화딱지가 나서 갑작스레 만들었습니다.
디자이너라면 다들 겪으시는거죠? 바보통이 와서 저만 이런 게 아니였으면 좋겠습니다.. .

잘 사용하세요.
```


## 사용 하기

아래 링크를 열고 PDF를 선택하면 됩니다.

```text
https://hyun2xyz.github.io/bookbookbook/
```

설치도 필요 없습니다. 열린 뒤 PDF 변환은 브라우저 안에서 진행됩니다.

## macOS에서 앱이 막힐 때

Bookbookbook DMG는 현재 Apple Developer ID 서명과 notarization을 붙이기 전의 로컬 빌드라서, macOS가 처음 실행을 막을 수 있습니다.
이건 바이러스가 발견됐다는 뜻이 아니라, Apple이 공증한 앱이 아니라는 보안 안내입니다.

그래도 열기 경로:

1. DMG를 엽니다.
2. DMG 창 안의 `Bookbookbook.app`을 우클릭합니다.
3. `열기`를 선택합니다.
4. macOS가 확인 창을 띄우면 다시 `열기`를 누릅니다.

그래도 막히면 `시스템 설정` → `개인정보 보호 및 보안` → 아래쪽 `보안` 영역에서 `Bookbookbook` 항목의 `그래도 열기`를 누릅니다.

참고: 현재 빌드는 Developer ID 서명과 notarization이 없는 ad-hoc 빌드입니다. macOS 버전에 따라 시스템 `/Applications` 폴더로 옮긴 앱이 실행되지 않을 수 있습니다. 이 경우 DMG 안에서 바로 열거나, 사용자 홈의 `~/Applications` 폴더에 복사해서 여세요. 인터넷 공개 배포에서 시스템 `/Applications` 설치를 안정적으로 지원하려면 Apple Developer ID 서명과 notarization이 필요합니다.

## 지원하는 PDF 형태

대부분의 PDF의 형태를 지원하고요
하지만 될 수도 있고 안될 수도 있습니다... 
제보를 부탁합니다.

## 저장과 개인정보

- PDF는 GitHub나 IYO 서버로 업로드되지 않습니다.
- 변환은 브라우저 메모리 안에서 처리됩니다.
- 결과 PDF는 사용자가 직접 다운로드합니다.
- 새로고침하거나 창을 닫으면 브라우저 안의 작업 상태는 사라집니다.

## 폴더 구조

```text
assets/
  bookbookbook.png        README 최상단 이미지

pages/
  GitHub Pages에 배포되는 브라우저 전용 정적 앱
  pdf-lib으로 PDF를 재배치하고 PDF.js로 미리보기를 렌더링

local-package/
  기존 Python 로컬 서버 버전
  완전 오프라인 작업이나 Python 기반 유지보수가 필요할 때 사용

desktop/
  Pages 앱을 로컬 macOS 앱으로 감싸는 Electron 패키지
  DMG 파일을 만들 때 사용
```

## 개발과 검증

정적 Pages 앱을 개발하거나 검증할 때:

```bash
cd pages
npm install
npm test
npm run build
npm run smoke
```

`npm run smoke`는 브라우저를 열어 PDF 선택, 미리보기, 변환, 다운로드된 PDF 검증까지 자동으로 확인합니다.

## 배포

Pages 배포 대상은 `gh-pages` 브랜치입니다. 개발은 `pages/`에서 하고, 빌드 결과물인 `pages/dist/`를 `gh-pages` 브랜치 루트에 배포합니다.

## Python 로컬 패키지로 쓰기

기존 Python 방식도 `local-package/` 안에 보존되어 있습니다. 이 방식은 한 번 설치가 끝나면 인터넷 없이 실행할 수 있습니다.

처음 설치:

```bash
cd local-package
brew install git python poppler
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

실행:

```bash
cd local-package
./run_app.sh
```

브라우저 주소:

```text
http://127.0.0.1:8765
```

Python 로컬 패키지 테스트:

```bash
cd local-package
source .venv/bin/activate
PYTHONPATH=src python -m unittest discover -s tests -v
```

## macOS 로컬 앱 DMG 만들기

웹 브라우저 대신 로컬 앱으로 쓰고 싶을 때는 `desktop/` 패키지를 사용합니다. PDF 변환 로직은 `pages/` 앱과 같고, 앱 안에서 로컬 파일로 실행됩니다.

처음 설치:

```bash
cd desktop
npm install
```

DMG 생성:

```bash
cd desktop
npm run dist
```

생성 위치:

```text
desktop/dist/Bookbookbook-1.0.7.dmg
```

주의: 현재 DMG는 Developer ID 서명과 notarization이 없는 로컬 빌드입니다. 인터넷에 공개 배포하려면 Apple Developer ID 서명과 notarization을 추가해야 합니다.
