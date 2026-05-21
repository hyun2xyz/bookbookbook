![Bookbookbook](assets/bookbookbook.png)

###Bookbookbook(북북북 쓰다듬기)
```
안녕하세요, 현입니다.

저는 한국에서 편집디자인을 공부하며 AI를 활용한 다양한 파이프라인을 연구하고,사람들과 공유하는 일을 하고 있어요.
월드와이드웹의 공유 철학과 Html, 유머 그리고 글짓기를 사랑합니다.

이건 소책자를 만드는 웹 사이트인데요,
제가 인디자인에서 소책자 인쇄를하거나 아크로벳 에서 중철 인쇄용으로 변환 하다가 화딱지가 나서 갑작스레 만들었습니다.
디자이너라면 다들 겪으시는거죠? 바보통이 와서 저만 이런 게 아니였으면 좋겠습니다.. .

잘 사용하세요.
```



----

Bookbookbook은 **PDF**로 뽑은 파일을 **중철 출력용 PDF**로 바꿔주는 도구입니다. 이제 기본 사용 방식은 GitHub Pages에서 바로 여는 정적 웹앱입니다. PDF는 서버로 업로드되지 않고, 사용자의 브라우저 안에서 처리됩니다.

### 바로 쓰기

아래 링크를 열고 PDF를 선택하면 됩니다.

```text
https://hyun2xyz.github.io/bookbookbook/
```

설치가 필요 없습니다. 인터넷은 처음 페이지를 열 때 필요하고, 열린 뒤 PDF 변환은 브라우저 안에서 진행됩니다.

## 지원하는 PDF 형태

현재 버전은 아래 형태의 PDF를 기준으로 동작합니다.

- 1쪽: 앞표지 단면 페이지
- 중간 페이지: 두 쪽이 붙어 있는 스프레드 페이지
- 마지막 쪽: 뒤표지 단면 페이지

Bookbookbook은 스프레드를 낱장 페이지로 나누고, 전체 쪽수가 4의 배수가 되도록 뒤표지 앞에 빈 페이지를 추가한 뒤, 중철 인쇄용 스프레드 PDF를 만듭니다.

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
