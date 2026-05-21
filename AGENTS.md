# Bookbookbook Local Install Agent

이 파일은 Bookbookbook 저장소에서 설치, 실행, 검증, README 정리를 맡는 에이전트 지침이다. 더 가까운 `AGENTS.md`가 생기면 그 지침을 우선한다.

## 역할

- 새 사용자가 macOS 로컬 환경에서 Bookbookbook을 열 수 있게 설치 흐름을 유지한다.
- README의 설치 명령, 실제 실행 스크립트, Python 의존성, Homebrew 의존성이 서로 어긋나지 않게 관리한다.
- 변경 후에는 실제 명령으로 검증하고, 확인한 결과만 완료로 말한다.

## 설치 원칙

- npm, Node.js, JavaScript 빌드 도구를 추가하지 않는다. 현재 앱은 정적 HTML/CSS/JS와 Python 로컬 서버로 동작한다.
- macOS 시스템 패키지는 Homebrew 기준으로 안내한다.
- 필요한 Homebrew 패키지는 `git`, `python`, `poppler`이다. `poppler`는 PDF 미리보기용 `pdftoppm`을 제공한다.
- Python 패키지는 `requirements.txt`에서 관리한다. 현재 핵심 패키지는 `pypdf`이다.
- 프로젝트 전용 가상환경은 `.venv`를 기본으로 안내하고, `.venv/`는 Git에 커밋하지 않는다.

## 주요 명령

처음 설치:

```bash
brew install git python poppler
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

실행:

```bash
./run_app.sh
```

브라우저 주소:

```text
http://127.0.0.1:8765
```

테스트:

```bash
source .venv/bin/activate
PYTHONPATH=src python -m unittest discover -s tests -v
```

## 검증 체크리스트

- `command -v pdftoppm`으로 Poppler 설치 상태를 확인한다.
- `python -m pip install -r requirements.txt`가 성공하는지 확인한다.
- `PYTHONPATH=src python -m unittest discover -s tests -v`를 실행한다.
- `./run_app.sh`로 서버가 뜨고 `http://127.0.0.1:8765/`가 `HTTP 200 OK`를 반환하는지 확인한다.
- `8765` 포트가 이미 사용 중이면 기존 서버를 중지하거나 원인을 보고한다. 임의로 다른 포트를 문서화하지 않는다.

## 문서 관리

- README 맨 위 이미지는 `assets/bookbookbook.png`를 사용한다.
- 저장소 이름과 clone URL은 `hyun2xyz/bookbookbook` 기준으로 유지한다.
- 설치 절차를 바꾸면 `README.md`, `requirements.txt`, `run_app.sh`, 이 `AGENTS.md`가 서로 일치하는지 확인한다.
- 실제 고객 PDF나 개인 파일을 샘플로 커밋하지 않는다. 생성물은 `work/`와 `output/` 아래에 두고 Git에 올리지 않는다.
