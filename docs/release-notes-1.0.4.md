# Bookbookbook 1.0.4 Release Notes

## 업데이트 노트

- macOS에서 앱을 다시 열었을 때 이미 떠 있는 Bookbookbook 창을 앞으로 가져오도록 보강했습니다.
- 같은 앱이 중복 실행되지 않도록 single instance 처리를 추가했습니다.
- Dock, Finder, DMG에서 다시 실행하는 흐름을 smoke test에 반영했습니다.

## 실행 안내

- 현재 DMG는 Developer ID 서명과 notarization이 없는 로컬 빌드입니다.
- 다른 Mac에서 처음 열 때 macOS가 차단하면 우클릭 후 `열기` 또는 시스템 설정의 `그래도 열기`를 사용해야 할 수 있습니다.
- 공개 배포용으로 자연스럽게 열리게 하려면 Apple Developer ID 서명과 notarization이 필요합니다.

## 검증

- `npm test`
- `npm run build`
- `npm run smoke`
- `npm run dist`
- `hdiutil verify desktop/dist/Bookbookbook-1.0.4.dmg`
- `desktop` 앱 smoke test
