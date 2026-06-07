# Bookbookbook 1.0.5 Release Notes

## 업데이트 노트

- macOS에서 `/Applications`로 복사한 뒤 실행이 막히는 환경을 피하기 위해 DMG 안에서 바로 실행하는 배포 형태로 조정했습니다.
- DMG 창에서 Applications 링크와 화살표를 제거했습니다.
- 실행 안내를 `DMG 안에서 우클릭 후 열기` 흐름으로 수정했습니다.
- 앱 실행 시 창을 숨긴 상태로 기다리지 않고 바로 표시되도록 유지했습니다.

## 실행 안내

- DMG를 연 뒤 `Bookbookbook.app`을 `응용 프로그램` 폴더로 옮기지 말고, DMG 창 안에서 바로 우클릭 후 `열기`를 선택해 주세요.
- 현재 DMG는 Developer ID 서명과 notarization이 없는 로컬 빌드입니다.
- macOS 경고는 바이러스 감지가 아니라 Apple 공증 전 앱이라는 안내입니다.
- 공개 배포용으로 자연스럽게 열리게 하려면 Apple Developer ID 서명과 notarization이 필요합니다.

## 검증

- `npm test`
- `npm run smoke`
- `npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.5.dmg`
- DMG 안 `Bookbookbook.app` 직접 실행 확인
