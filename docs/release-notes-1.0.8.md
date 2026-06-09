# Bookbookbook 1.0.8 Release Notes

## 변경 사항

- 출력 용지 옵션에 `선택 안 함`을 다시 추가했습니다.
- `선택 안 함`을 고르면 재단선과 출력 용지 배치 없이, 중철 인쇄 순서만 맞춘 PDF를 만듭니다.
- 기본 출력 용지는 계속 `A4`로 유지해서 바로 재단선 포함 출력 배치를 만들 수 있습니다.
- `선택 안 함` 문구가 잘리지 않도록 Pages와 데스크톱 앱의 출력 용지 선택 폭을 조정했습니다.
- Pages와 데스크톱 앱 테스트가 `선택 안 함` 옵션과 재단선 없는 변환 결과를 확인하도록 보강했습니다.
- 앱 버전을 `1.0.8`로 올려 이전 DMG/Windows 설치 파일과 구분되게 했습니다.

## 검증

- `cd pages && npm test`
- `cd pages && npm run build`
- `cd pages && npm run smoke`
- `cd desktop && npm run smoke`
- `cd desktop && npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.8.dmg`
- `cd desktop && npm run dist:win`
- Windows installer `.exe` 파일 형식과 SHA256 확인
- GitHub Pages live URL에서 출력 용지 `선택 안 함` 옵션 확인
