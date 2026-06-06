# Bookbookbook 1.0.2 Release Notes

## 업데이트 노트

- 왼쪽 소개와 사용설명서 패널을 접었다 펼 수 있는 햄버거 메뉴를 추가했습니다.
- 햄버거 메뉴는 작업 지면의 우측 상단에 배치해서 PDF 작업 공간을 넓게 쓸 수 있게 했습니다.
- 접힌 상태에서는 작업 패널이 가운데로 넓어지고, 다시 누르면 소개와 사용설명서가 돌아옵니다.
- 오른쪽 작업 지면의 상단 제목을 `PDF PREVIEW`에서 `BOOK BOOK BOOK`으로 바꿨습니다.
- 접기/펼치기 상태를 smoke test에 추가해 데스크톱 앱에서 동작을 확인하도록 했습니다.

## 검증

- `npm test`
- `npm run build`
- `npm run smoke`
- `npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.2.dmg`
- `desktop` 앱 smoke test
