# Bookbookbook 1.0.3 Release Notes

## 업데이트 노트

- 앱을 처음 열었을 때 소개와 사용설명서 패널이 닫힌 상태로 시작되도록 바꿨습니다.
- 햄버거 메뉴를 누르면 소개와 사용설명서 패널이 왼쪽이 아니라 오른쪽에서 열리도록 조정했습니다.
- 작업 지면 상단 제목 `BOOK BOOK BOOK`의 위쪽 여백을 넓혀 macOS 창 버튼과 덜 붙게 했습니다.
- 접힘/펼침 기본값과 오른쪽 열림 동작을 smoke test에 반영했습니다.

## 검증

- `npm test`
- `npm run build`
- `npm run smoke`
- `npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.3.dmg`
- `desktop` 앱 smoke test
