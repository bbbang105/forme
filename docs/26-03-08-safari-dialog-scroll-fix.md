# Safari 다이얼로그 스크롤 수정

## 문제

- 모바일 PWA에서 이벤트 등록 다이얼로그가 화면보다 커서 잘리는 문제
- Chrome에서는 정상 동작하지만 Safari에서 스크롤이 안 됨

## 원인 분석 (Chrome vs Safari 차이)

| 항목 | Chrome | Safari |
|------|--------|--------|
| `overscroll-behavior-y: contain` | 부모 체이닝만 차단 | fixed 자식 요소의 스크롤까지 차단 |
| `display: grid` + `overflow-y: auto` | 정상 스크롤 | 콘텐츠 클리핑 (스크롤 안됨) |
| 부모에 `transform`/`will-change` | 자식 스크롤 정상 | 자식 스크롤 깨질 수 있음 |
| `-webkit-overflow-scrolling: touch` | 불필요 | PWA에서 필요할 수 있음 |

## 적용한 수정사항

### 1. globals.css - 다이얼로그 열릴 때 overscroll-behavior 해제

- `body[data-scroll-locked]`에 `overscroll-behavior-y: auto` 추가
- Radix Dialog가 열리면 body에 `data-scroll-locked` 속성이 추가됨
- 이를 감지하여 Safari가 내부 fixed 요소의 스크롤을 차단하지 않도록 함

### 2. dialog.tsx - grid에서 flex flex-col로 변경 + WebkitOverflowScrolling

- `display: grid` -> `display: flex; flex-direction: column` 변경
- Safari에서 grid + overflow-y: auto 조합이 스크롤 대신 클리핑되는 버그 방지
- `style={{ WebkitOverflowScrolling: 'touch' }}` 추가로 Safari PWA 관성 스크롤 활성화
- `top-50% translate-y-[-50%]` -> `inset-y-0 my-auto`로 변경하여 transform 없이 수직 센터링

### 3. use-pull-to-refresh.ts - 다이얼로그 열릴 때 제스처 스킵

- `document.body.hasAttribute('data-scroll-locked')` 체크 추가
- 다이얼로그 열린 상태에서 pull-to-refresh 제스처가 willChange 설정하여 Safari 스크롤 깨뜨리는 것 방지

### 4. event-form.tsx - 모바일 최적화

- DialogContent를 flex 레이아웃으로 변경하여 헤더 고정 + 폼 영역 스크롤
- 카테고리 칩 가로스크롤 -> flex-wrap으로 변경
- space-y-4 -> space-y-3으로 간격 축소
- date input에 text-sm 추가로 크기 축소

## 핵심 교훈

- Safari의 `overscroll-behavior-y: contain`은 Chrome보다 공격적으로 동작하여 fixed 자식 요소 스크롤까지 차단함
- Safari에서 `display: grid` + `overflow` 조합은 알려진 WebKit 버그로 스크롤 대신 클리핑 발생
- `.next` 캐시가 CSS 변경을 반영하지 않을 수 있으므로 `rm -rf .next` 후 재시작 필요

## 관련 파일

- `packages/web/src/app/globals.css`
- `packages/web/src/components/ui/dialog.tsx`
- `packages/web/src/hooks/use-pull-to-refresh.ts`
- `packages/web/src/components/features/calendar/event-form.tsx`
