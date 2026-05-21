![Bookbookbook](assets/bookbookbook.png)

Bookbookbook(북북북 쓰다듬기)

Bookbookbook은 **페이지 PDF**로 뽑은 파일을 **중철 출력용 PDF**로 바꿔주는 로컬 도구입니다. 브라우저에서 열리지만 변환은 내 컴퓨터 안에서만 실행됩니다. PDF가 외부 서버로 업로드되지 않습니다.

## 필요한 것 !

macOS 기준으로 아래 도구가 필요합니다. 처음 한 번만 설치하면 됩니다.

- **Homebrew**: Mac용 프로그램과 개발 도구를 설치하는 패키지 관리자
- **Git**: 이 저장소를 내려받는 도구
- **Python 3.10 이상**: 로컬 서버를 실행하는 도구
- **Poppler**: PDF 페이지 미리보기에 필요한 `pdftoppm` 명령을 제공하는 도구

Bookbookbook은 **npm, Node.js, JavaScript 빌드 과정이 필요 없습니다.**

## 처음 설치하기

1. Homebrew가 없다면 먼저 설치합니다.

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Git, Python, Poppler를 설치합니다.

   ```bash
   brew install git python poppler
   ```

3. Bookbookbook을 내려받습니다.

   ```bash
   git clone https://github.com/hyun2xyz/bookbookbook.git
   cd bookbookbook
   ```

   Git을 쓰지 않는다면 GitHub의 **Code > Download ZIP**으로 받아도 됩니다. 압축을 푼 뒤 Terminal에서 그 폴더로 이동하세요.

4. 이 프로젝트 전용 Python 환경을 만듭니다.

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

5. Bookbookbook을 실행합니다.

   ```bash
   ./run_app.sh
   ```

6. 브라우저에서 아래 주소를 엽니다.

   ```text
   http://127.0.0.1:8765
   ```

앱을 사용하는 동안 Terminal 창을 닫지 마세요. 종료하려면 Terminal에서 `Control+C`를 누르면 됩니다.

## 다음부터 실행하기

처음 설치를 끝낸 뒤에는 보통 아래 두 줄만 실행하면 됩니다.

```bash
cd bookbookbook
./run_app.sh
```

그 다음 브라우저에서 엽니다:

```text
http://127.0.0.1:8765
```

`.venv` 폴더를 지웠거나 새 컴퓨터에서 다시 여는 경우에는 처음 설치 과정을 다시 진행하세요.

## GitHub Pages 링크로 쓰기

Bookbookbook은 GitHub Pages 링크에서도 화면을 열 수 있습니다.

```text
https://hyun2xyz.github.io/bookbookbook/
```

다만 Pages 링크는 브라우저 화면만 제공합니다. PDF 변환은 각자 자기 컴퓨터에서 실행 중인 로컬 서버가 처리합니다. 그래서 처음 한 번은 위의 설치 과정을 끝내고, 사용할 때마다 Terminal에서 아래 명령을 먼저 실행해야 합니다.

```bash
cd bookbookbook
./run_app.sh
```

그 다음에는 `https://hyun2xyz.github.io/bookbookbook/`를 열어도 되고, `http://127.0.0.1:8765`를 열어도 됩니다. 두 경우 모두 PDF는 자기 컴퓨터 안에서 처리됩니다.

## 파일이 저장되는 위치

Bookbookbook은 작업 파일을 이 프로젝트 폴더 안에 저장합니다.

- 업로드한 PDF: `work/uploads/`
- 미리보기 파일: `work/previews/`
- 변환된 중철 PDF: `output/`

이 파일들은 Git에 올라가지 않도록 설정되어 있습니다.

## 지원하는 PDF 형태

현재 버전은 아래 형태의 PDF를 기준으로 동작합니다.

- 1쪽: 앞표지 단면 페이지
- 중간 페이지: 두 쪽이 붙어 있는 스프레드 페이지
- 마지막 쪽: 뒤표지 단면 페이지

Bookbookbook은 스프레드를 낱장 페이지로 나누고, 전체 쪽수가 4의 배수가 되도록 뒤표지 앞에 빈 페이지를 추가한 뒤, 중철 인쇄용 스프레드 PDF를 만듭니다.

## 문제가 생겼을 때

### `ModuleNotFoundError: No module named 'pypdf'`

Python 패키지가 아직 설치되지 않은 상태입니다. 아래 명령을 실행하세요.

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
```

그 다음 `./run_app.sh`를 다시 실행합니다.

### `pdftoppm` 오류가 나거나 미리보기가 보이지 않을 때

Poppler가 없을 가능성이 큽니다.

```bash
brew install poppler
```

PDF 변환 자체는 가능할 수 있지만, 페이지 미리보기 이미지는 `pdftoppm`이 있어야 만들어집니다.

### 브라우저에서 연결할 수 없다고 나올 때

Terminal에서 로컬 서버가 실행 중인지 확인하세요. 정상 실행 중이면 아래 문구가 보입니다.

```text
Bookbookbook running at http://127.0.0.1:8765
```

그 다음 브라우저에서 `http://127.0.0.1:8765`를 엽니다.

### `Port 8765 is already in use`라고 나올 때

이미 Bookbookbook이 켜져 있거나 다른 로컬 앱이 같은 포트를 쓰고 있는 상태입니다. 기존 Bookbookbook Terminal 창에서 `Control+C`를 누른 뒤 `./run_app.sh`를 다시 실행하세요.

## 테스트 실행

```bash
source .venv/bin/activate
PYTHONPATH=src python -m unittest discover -s tests -v
```
