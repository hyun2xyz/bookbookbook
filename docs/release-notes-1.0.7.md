# Bookbookbook 1.0.7 Release Notes

## 변경 사항

- 출력 용지 프리셋에 `A4`, `A3`, `A2`, `A1`, `A0`를 모두 추가했습니다.
- 출력 용지 프리셋에 `B5`, `B4`, `B3`, `B2`, `B1`, `B0`를 모두 추가했습니다.
- Pages와 데스크톱 앱 테스트가 새 A/B 출력 용지 목록을 확인하도록 보강했습니다.
- 앱 버전을 `1.0.7`로 올려 이전 DMG/Windows 설치 파일과 구분되게 했습니다.

## 검증

- `cd pages && npm test`
- `cd pages && npm run build`
- `cd pages && npm run smoke`
- `cd desktop && npm run smoke`
- `cd desktop && npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.7.dmg`
- `cd desktop && npm run dist:win`
- Windows installer `.exe` 파일 형식과 SHA256 확인
- GitHub Pages live URL에서 출력 용지 옵션 확인
