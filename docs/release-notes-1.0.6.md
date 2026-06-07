# Bookbookbook 1.0.6 Release Notes

## 변경 사항

- DMG 창에 `Applications` 바로가기를 다시 추가했습니다.
- macOS ad-hoc 빌드에서 시스템 `/Applications` 복사 실행이 막힐 수 있어, DMG 직접 실행과 `~/Applications` 우회 경로를 README에 정리했습니다.
- Windows x64용 zip 다운로드 파일을 추가했습니다.
- 앱 버전을 `1.0.6`으로 올려 이전 DMG와 구분되게 했습니다.

## 검증

- `cd pages && npm test`
- `cd pages && npm run build`
- `cd pages && npm run smoke`
- `cd desktop && npm run smoke`
- `cd desktop && npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.6.dmg`
- DMG 안의 앱 직접 실행 확인
- `~/Applications/Bookbookbook.app` 복사 실행 확인
- `npx electron-builder --win zip --x64 --publish never`
- `unzip -t desktop/dist/Bookbookbook-1.0.6-win.zip`
