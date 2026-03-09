# forme

개인 올인원 PWA - 큐레이션, 캘린더, 메모, 팟캐스트

## 프로젝트 구조

pnpm 모노레포: `packages/web` (Next.js 16 PWA) + `packages/shared` (DB 스키마, 타입, 유틸)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19, TypeScript |
| DB & Auth | Supabase (Auth + PostgreSQL + RLS) |
| ORM | Drizzle ORM (`packages/shared/src/schema/`) |
| 스토리지 | Cloudflare R2 (팟캐스트 음성, 메모 이미지) |
| 스타일링 | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 푸시알림 | web-push + Service Worker + Supabase pg_cron (리마인더) |
| RSS | feedsmith |
| DnD | @dnd-kit (core + sortable + modifiers) |
| 에디터 | TipTap + CodeBlockLowlight (lowlight 선택적 12언어 등록) |
| 패키지 관리 | pnpm workspace |
| 번들 분석 | @next/bundle-analyzer (`ANALYZE=true pnpm build`) |
| 배포 | Vercel (리전: `icn1` 서울, Hobby 플랜) |
| 스케줄링 | Vercel Cron (일 1회) + Supabase pg_cron + pg_net (고빈도) |

## 개발 명령어

```bash
pnpm install          # 의존성 설치
pnpm dev              # 개발 서버 (port 3200)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint
pnpm typecheck        # TypeScript 타입 체크
pnpm test             # Vitest 테스트 (packages/web)
pnpm db:generate      # Drizzle 마이그레이션 생성
pnpm db:push          # 스키마 직접 push (dev용)
```

## 코딩 컨벤션

- Server Actions → `packages/web/src/lib/actions/`, Server Components 우선
- 인증: `getAuthUser()` from `lib/auth.ts` (React.cache로 요청당 1회 인증)
- 인증 필요 페이지 → `(main)` route group, 비인증 → `(auth)` route group
- DB 접근 시 RLS 의존 (`auth.uid() = user_id`), 추가 권한 체크 불필요
- 스타일: Tailwind 유틸리티 클래스, 하드코딩 색상 금지 (CSS 변수 사용)
- 컴포넌트: shadcn/ui 기반, `components/ui/`에 위치
- 공유 검증 상수: `lib/validators.ts` (DATE_REGEX, HEX_COLOR_REGEX, UUID_REGEX, TIME_REGEX) — 모든 actions/API에서 import (인라인 정규식 금지)
- Server Actions 입력 검증: 날짜(YYYY-MM-DD), 색상(#hex), UUID, 길이 제한 등 서버측 검증 필수
- Server Actions UUID 검증: 모든 CRUD 함수의 id 파라미터에 UUID_REGEX 검증 적용
- API Route 핸들러 순서: 인증(auth) → 입력 검증(UUID 등) → 비즈니스 로직 (인증 전에 입력 검증하지 않음)
- KST 시간대: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 사용
- API 트레이싱: `withTracing()` 래퍼로 모든 API 라우트 자동 타이밍 측정
- Server Action 트레이싱: `traceAction()` + `traceQuery()` 래퍼로 DB 쿼리 성능 측정
- 무거운 컴포넌트: `next/dynamic` + `ssr: false`로 지연 로딩 (TipTap, DnD Kit, EventForm, CategoryManager 등)
- 캘린더 인터랙션: Optimistic updates 패턴, 데스크톱 2컬럼 (`lg:flex-row`), lane 기반 이벤트 배치 (hazel-admin 스타일, greedy lane 할당 + startTime 순 정렬 + 멀티데이 바 연결), 삭제 시 AlertDialog 확인 모달, 반복 일정 (매주/격주 + 요일 선택, excludedDates로 개별 삭제, recurrenceEndDate로 이후 삭제)
- 투두: DnD 드래그 순서변경 (@dnd-kit, GripVertical 핸들, 모바일 항상 표시), 밀린 투두 칩 (date < 오늘 && 미완료 → amber 칩 + "오늘로" 이동), 완료 애니메이션 (check-bounce), 빈 상태 격려 문구
- Cron 인증: `lib/cron-auth.ts` — `verifyCronAuth()` 공유 헬퍼 (timingSafeEqual + CRON_USER_ID 검증), 모든 cron 라우트에서 사용
- 푸시 알림 Cron: 데일리 요약 (08:00 KST, 일정+투두 카운트), 일정 리마인더 (15분 간격, startTime 1시간 전, reminderSent 플래그)
- 모바일 PWA: viewport `maximumScale: 1, userScalable: false`, 모든 input/textarea/select `text-base`(16px) 이상 (iOS 자동 줌 방지), 크롬 스타일 pull-to-refresh (`overscroll-behavior-y: contain` + DOM 직접 조작 + 컨텐츠 translateY + 인라인 SVG 인디케이터 + `window.location.reload()`)
- Safari PWA 대응: Dialog `flex flex-col` + `inset-y-0 my-auto` 센터링 (grid+translate 금지), `body[data-scroll-locked]`에서 `overscroll-behavior-y: auto` 해제, pull-to-refresh에서 다이얼로그 열림 감지 스킵
- 큐레이션 정렬: status=read 탭에서 readAt DESC 정렬 (최근 읽은 순)
- 큐레이션 삭제: 단건 삭제 (AlertDialog 확인) + 일괄 삭제 (체크박스 선택, 100개 청크), ownership은 curationSources join으로 검증
- 큐레이션 북마크 메모: InlineMemo 컴포넌트 (북마크 탭 전용, 500자, key prop으로 외부 상태 동기화)
- 큐레이션 UX: 스와이프 액션 (우→읽음, 좌→삭제), 컴팩트뷰 토글 (localStorage), 키보드 네비 (j/k/o/b, DOM 직접 포커스링 — useRef + data-curation-feed 스코프)
- 메모 캐싱: 에디터 뒤로가기 시 `router.refresh()` + MemoList initialMemos props 동기화
- 게이미피케이션: 출석 스트릭, 데일리 미션 (큐레이션 5개/팟캐스트 10분/투두 완료), 하이브리드 데이터 (전용 테이블 + 기존 데이터 계산)
- 외부 API: Open-Meteo (서울 날씨, 서버 컴포넌트 fetch, revalidate 3600)
- 팟캐스트 플레이어: `usePlayer()` (상태/컨트롤) + `usePlayerTime()` (currentTime/duration) 컨텍스트 분리
- 팟캐스트 반자동화: 큐레이션 cron(22:00 KST) 후 Discord로 NotebookLM용 URL 전송 → 23:00 리마인더 → 수동 NotebookLM 생성 → 앱에서 업로드
- Discord 웹훅: `lib/discord.ts` — URL 패턴 검증 + 5초 타임아웃 + 에러 내부 흡수
- DB 커넥션: `max: 1` (Supabase Transaction Pooler가 실제 풀 관리, 서버리스 최적)
- 성능: `serverExternalPackages`로 서버 전용 패키지 번들 제외, AVIF 이미지 포맷, 병렬 쿼리 (`Promise.all`), SW LRU 캐시 (오디오 50개, 정적 100개), SW HTML/RSC network-first (4초 타임아웃 + 캐시 폴백), 리스트 아이템 `React.memo` (CurationCard, CurationListRow, EpisodeCard, MemoCard)
- 에러 바운더리: 모든 (main) 페이지에 `error.tsx` 배치 (calendar, curation, memo, podcast), `error` prop 로깅 + 제네릭 메시지만 표출
- 접근성: 탭바 `aria-current="page"`, 검색 input `aria-label`, 이벤트 폼 색상 버튼 `focus-visible:ring-2` + `aria-label`
- 아이콘 통일: 대시보드/팟캐스트 이모지 → lucide-react 아이콘 (Newspaper, Headphones, CheckSquare, Flame, Mic, FileText)
- SSRF 방어: `lib/url-safety.ts` — IPv4/IPv6 사설 대역, IPv4-mapped IPv6, ULA(fc00::/7), Link-Local(fe80::/10) 차단
- 컴포넌트 분리: 대형 컴포넌트 → 하위 컴포넌트 추출 (source-card, crawl-settings-form, calendar-header, recurrence-form, feed-filter-bar, tag-input)
- 자동저장 훅: `hooks/use-auto-save.ts` — saveFnRef 패턴, Promise 기반 동시 저장 방어, detach() API
- 테스트: Vitest + `vi.hoisted()` Proxy 기반 DB 목 패턴 (`packages/web/src/__tests__/`)

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `packages/web/src/proxy.ts` | Next.js 16 proxy (인증 리다이렉트, `/api/cron/` 우회 허용) |
| `packages/web/src/app/(main)/layout.tsx` | 인증 레이아웃 (LayoutShell + 탭바) |
| `packages/web/src/app/(auth)/login/page.tsx` | Discord 로그인 |
| `packages/web/src/app/auth/callback/route.ts` | OAuth 콜백 (open redirect 방어) |
| `packages/web/src/lib/supabase/middleware.ts` | 세션 갱신 유틸 |
| `packages/web/src/lib/supabase/server.ts` | 서버 Supabase 클라이언트 |
| `packages/web/src/components/layout/tab-bar.tsx` | 하단 탭바 (5탭) |
| `packages/web/src/components/layout/header.tsx` | 헤더 (forme 로고 + 다크모드 토글) |
| `packages/web/src/components/ui/logo.tsx` | 레트로 {f} 픽토그램 로고마크 (useId 패턴 ID, 다크모드 대응) |
| `packages/shared/src/schema/calendar-events.ts` | 캘린더 이벤트 스키마 (반복: recurrenceType/Days/EndDate, excludedDates, reminderSent) |
| `packages/shared/src/schema/todos.ts` | 투두 스키마 |
| `packages/shared/src/schema/` | Drizzle DB 스키마 (전체) |
| `packages/shared/src/db.ts` | DB 싱글톤 (SSL 강제, max:1 서버리스 최적) |
| `packages/web/src/lib/crawl-feed.ts` | RSS 크롤 (feedsmith, since 필터, SSRF 방어) |
| `packages/web/src/lib/validators.ts` | 공유 검증 정규식 (DATE, HEX_COLOR, UUID, TIME) |
| `packages/web/src/lib/url-safety.ts` | SSRF 방어 유틸 (IPv4/IPv6/ULA/Link-Local 차단) |
| `packages/web/src/lib/auth.ts` | 인증 유틸 (React.cache 기반 getAuthUser) |
| `packages/web/src/lib/logger.ts` | 구조화 로거 (withTracing, traceAction, traceQuery) |
| `packages/web/src/lib/r2.ts` | Cloudflare R2 업로드/삭제 유틸 (Cache-Control 포함) |
| `packages/web/src/components/layout/layout-shell.tsx` | 클라이언트 레이아웃 셸 (PlayerProvider + MiniPlayer + PullToRefresh) |
| `packages/web/src/components/layout/pull-to-refresh.tsx` | 크롬 스타일 Pull-to-Refresh (컨텐츠 translateY + 인라인 SVG 인디케이터) |
| `packages/web/src/hooks/use-pull-to-refresh.ts` | Pull-to-Refresh 훅 (DOM 직접 조작, 스크롤 컨테이너 감지, window.location.reload, 다이얼로그 열림 감지 스킵) |
| `packages/web/src/lib/push.ts` | 푸시 알림 발송 (sendPushToUser) |
| `packages/web/src/lib/greetings.ts` | 대시보드 인사 문구 (100개 랜덤) |
| `packages/web/src/app/api/curation/crawl/route.ts` | SSE 수동 크롤 API |
| `packages/web/src/app/api/curation/sources/reorder/route.ts` | 즐겨찾기 소스 순서 배치 업데이트 |
| `packages/web/src/lib/cron-auth.ts` | Cron 공유 인증 유틸 (verifyCronAuth, safeCompare) |
| `packages/web/src/app/api/cron/curation/route.ts` | Cron 자동 크롤 + 푸시 알림 (verifyCronAuth 인증, 응답에 내부 상세 미노출) |
| `packages/web/src/app/api/cron/calendar-daily/route.ts` | Cron 데일리 요약 푸시 (08:00 KST, 일정+투두 카운트, reminderSent 리셋) |
| `packages/web/src/app/api/cron/calendar-reminder/route.ts` | 일정 리마인더 푸시 (Supabase pg_cron 15분 호출, 1시간 전 알림, 반복 일정 대응) |
| `supabase/pg-cron-setup.sql` | Supabase pg_cron + pg_net 설정 SQL (calendar-reminder 15분 스케줄) |
| `packages/web/src/app/api/podcast/upload/route.ts` | 팟캐스트 오디오 R2 업로드 |
| `packages/web/src/app/api/podcast/episodes/route.ts` | 팟캐스트 에피소드 CRUD |
| `packages/web/src/app/api/push/subscribe/route.ts` | 푸시 구독 등록/해제/조회 |
| `packages/web/src/components/features/podcast/player-context.tsx` | 팟캐스트 플레이어 (PlayerContext + PlayerTimeContext 분리, localStorage 이어듣기, 청취시간 DB 동기화) |
| `packages/web/src/lib/discord.ts` | Discord 웹훅 전송 유틸 (sendDiscordMessage, sendDiscordEmbed) |
| `packages/web/src/app/api/cron/podcast-reminder/route.ts` | 팟캐스트 제작 리마인더 (23:00 KST, Discord 알림) |
| `packages/web/src/components/features/podcast/episode-card.tsx` | 에피소드 카드 (React.memo, 재생/일시정지, 메뉴) |
| `packages/web/src/components/features/memo/memo-editor-lazy.tsx` | MemoEditor 지연 로딩 래퍼 (next/dynamic, ssr: false) |
| `packages/web/src/components/features/curation/mini-card-thumbnail.tsx` | 대시보드 큐레이션 썸네일 (클라이언트 onError 폴백) |
| `packages/web/public/sw.js` | Service Worker (PWA + 푸시 + 전략별 캐싱 + 오디오 오프라인 + LRU trimCache) |
| `packages/web/src/app/manifest.ts` | PWA 매니페스트 (MetadataRoute) |
| `packages/web/src/lib/actions/calendar.ts` | 캘린더 이벤트 Server Actions (CRUD + 반복 확장 + excludeRecurringDate/deleteRecurringAfter) |
| `packages/web/src/lib/actions/todos.ts` | 투두 Server Actions (CRUD + 토글 + DnD 벌크 reorder + 입력 검증) |
| `packages/web/src/components/features/calendar/calendar-client.tsx` | 캘린더 메인 클라이언트 (월간뷰, 스와이프, optimistic updates, 데스크톱 2컬럼, 밀린 투두 칩) |
| `packages/web/src/components/features/calendar/calendar-grid.tsx` | 캘린더 그리드 (lane 기반 이벤트 배치, startTime 순 정렬, 컬러 dot, 멀티데이 바 연결) |
| `packages/web/src/components/features/calendar/todo-list.tsx` | 투두 리스트 (DnD 순서변경, optimistic 추가/토글/삭제, 완료 애니메이션, 빈 상태 격려 문구) |
| `packages/web/src/components/features/calendar/calendar-header.tsx` | 캘린더 헤더 (월 네비게이션, 오늘 버튼) |
| `packages/web/src/components/features/calendar/event-form.tsx` | 이벤트 폼 (생성/수정/삭제, optimistic 콜백, 종료시간 자동동기화, 모바일 flex 스크롤 레이아웃) |
| `packages/web/src/components/features/calendar/recurrence-form.tsx` | 반복 일정 설정 UI (매주/격주, 요일 선택, 종료일) |
| `packages/web/src/components/features/calendar/event-list.tsx` | 이벤트 목록 (선택 날짜별 필터링, 반복 삭제 3옵션 다이얼로그, 빈 상태 격려 문구) |
| `packages/web/src/components/features/calendar/category-manager.tsx` | 이벤트 카테고리 관리 다이얼로그 |
| `packages/web/src/components/features/calendar/types.ts` | 캘린더 공유 타입 (CalendarEvent, Todo, EventCategory) |
| `packages/shared/src/schema/event-categories.ts` | 이벤트 카테고리 스키마 |
| `packages/web/src/lib/actions/categories.ts` | 카테고리 Server Actions (CRUD) |
| `packages/web/src/components/features/calendar/dashboard-calendar.tsx` | 대시보드 캘린더 위젯 (오늘 할일 + 다가오는 일정) |
| `packages/web/src/hooks/use-swipe.ts` | 터치 스와이프 훅 (모바일 월 이동) |
| `packages/shared/src/schema/memos.ts` | 메모 스키마 (JSONB content + contentText + tags) |
| `packages/web/src/lib/actions/memos.ts` | 메모 Server Actions (CRUD + 검색 + 고정 + 페이지네이션 + 태그 + TipTap JSON 검증) |
| `packages/web/src/hooks/use-auto-save.ts` | 자동저장 훅 (debounce, flush on blur/visibility, Promise 동시저장 방어) |
| `packages/web/src/components/features/memo/memo-editor.tsx` | TipTap 에디터 (useAutoSave 훅, 고정/삭제, 전체화면 fixed 레이아웃) |
| `packages/web/src/components/features/memo/tag-input.tsx` | 태그 입력 컴포넌트 (추가/삭제, MAX_TAGS=5) |
| `packages/web/src/components/features/memo/memo-toolbar.tsx` | 에디터 서식 툴바 (B/I/U/S, H1-H3, 리스트, 체크리스트, 링크, 이미지, 인라인코드, 코드블록) |
| `packages/web/src/components/features/memo/image-block.tsx` | 커스텀 이미지 확장 (React NodeView: 리사이즈, 삭제 버튼, 캡션) |
| `packages/web/src/components/features/memo/image-drop-plugin.ts` | 이미지 드래그앤드롭/붙여넣기 업로드 ProseMirror 플러그인 |
| `packages/web/src/components/features/memo/code-block-view.tsx` | 코드블록 React NodeView (언어 셀렉터 드롭다운, 15개 언어) |
| `packages/web/src/components/features/memo/memo-list.tsx` | 메모 목록 (서버 검색, 하이라이트, 정렬, 태그 필터, 페이지네이션) |
| `packages/web/src/components/features/memo/memo-card.tsx` | 메모 카드 (제목+날짜+미리보기, React.memo) |
| `packages/web/src/components/features/memo/dashboard-memo.tsx` | 대시보드 최근 메모 위젯 (에러 폴백) |
| `packages/web/src/components/features/memo/task-list-sort.ts` | ProseMirror 플러그인 (체크된 아이템 하단 자동정렬) |
| `packages/web/src/app/api/memo/image/route.ts` | 메모 이미지 R2 업로드 API (5MB, JPEG/PNG/GIF/WebP) |
| `packages/shared/src/schema/user-daily-activity.ts` | 일별 활동 스키마 (출석, 팟캐스트 청취시간) |
| `packages/web/src/lib/weather.ts` | 서울 날씨 유틸 (Open-Meteo API, 1시간 캐시) |
| `packages/web/src/lib/actions/activity.ts` | 게이미피케이션 Server Actions (출석/스트릭/미션 통계, Promise.all 병렬 쿼리) |
| `packages/web/src/components/features/dashboard/weather-widget.tsx` | 서울 날씨 위젯 (서버 컴포넌트, WMO 픽토그램) |
| `packages/web/src/components/features/dashboard/daily-missions.tsx` | 데일리 미션 카드 (lucide 아이콘, 프로그레스 바, 스트릭 표시) |
| `packages/web/src/components/features/dashboard/attendance-recorder.tsx` | 출석 기록 (클라이언트, 방문 시 자동 호출) |
| `packages/web/src/components/features/curation/source-card.tsx` | 소스 카드 (DnD, 즐겨찾기, 활성/비활성 토글) |
| `packages/web/src/components/features/curation/crawl-settings-form.tsx` | 크롤 설정 폼 (기간 선택, 수집 시작) |
| `packages/web/src/components/features/curation/feed-filter-bar.tsx` | 피드 필터 바 (검색, 즐겨찾기 소스, 카테고리/상태 필터, 정렬) |
| `packages/web/src/components/features/curation/mini-card-link.tsx` | 대시보드 큐레이션 클릭 시 읽음 처리 래퍼 |
| `packages/web/src/app/api/curation/[id]/route.ts` | 큐레이션 아이템 PATCH (읽음/북마크/메모) + DELETE (단건 삭제, ownership join 검증) |
| `packages/web/src/app/api/curation/bulk-delete/route.ts` | 큐레이션 일괄 삭제 (POST, max 100개, UUID 전수 검증) |
| `packages/web/src/hooks/use-swipe-action.ts` | 터치 스와이프 제스처 훅 (axis-lock, damped swipe, 타이머 정리) |

## 인증 구조

Discord OAuth → Supabase Auth → `proxy.ts`에서 세션 자동 갱신 (Next.js 16 방식).
RLS로 `auth.uid() = user_id` 강제. profiles 테이블로 멀티유저 확장 대비.
보안: CSP + HSTS + Permissions-Policy 헤더, open redirect 방어 적용.

## 디자인 시스템

study-admin 스타일: Sky Blue `#0ea5e9` 포인트, Pretendard 폰트, 다크모드 지원 (next-themes).

## 환경 변수

`.env.local` 참조. Supabase(URL, Anon Key, Service Key), R2(Access Key, Secret, Bucket), VAPID 키, Discord OAuth(Client ID/Secret), Cron(CRON_SECRET, CRON_USER_ID).

## 브랜치 전략

`main` → `dev` (디폴트) → `feature/*` 브랜치. 워크트리 4개 병렬 개발.

## 참고 프로젝트

| 프로젝트 | 경로 | 참고 대상 |
|----------|------|-----------|
| study-admin | `/Users/hansangho/Desktop/study-admin` | Discord OAuth, RSS/큐레이션, UXUI 전체, 디자인 시스템 |
| hazel-admin | `/Users/hansangho/Desktop/hazel-admin` | 캘린더, 푸시알림, PWA 설정, Server Actions 패턴 |

구현 시 기능/UI 적극 참고할 것. study-admin의 UXUI를 거의 동일한 구조로 맞출 것.

## 상세 참조 문서

| 문서 | 내용 |
|------|------|
| `docs/plans/26-03-03-forme-design.md` | 전체 설계 문서 |
| `docs/26-03-03-schema-summary.md` | DB 스키마 요약 (테이블, FK, enum) |
| `docs/26-03-03-patterns.md` | 인증/API/ORM 코드 패턴 |
| `docs/plans/26-03-04-memo-design.md` | 메모 기능 설계 문서 |
| `docs/plans/26-03-04-dashboard-redesign.md` | 대시보드 리디자인 설계 (날씨+게이미피케이션) |
| `docs/plans/26-03-05-calendar-redesign.md` | 캘린더 리디자인 설계 (카테고리+2컬럼 레이아웃) |
| `docs/plans/26-03-05-performance-optimization.md` | PWA 성능 최적화 (리전, 번들, 렌더링, 워터폴) |
| `docs/26-03-08-safari-dialog-scroll-fix.md` | Safari 다이얼로그 스크롤 수정 (Chrome vs Safari 차이, 해결책) |
| `docs/plans/26-03-08-calendar-push-ux-design.md` | 캘린더 푸시알림 + UX 개선 설계 (데일리 요약, 리마인더, 밀린 투두, 애니메이션) |

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-03-03-system-architecture.md`
- 설명은 다른 문서와 구분될 정도로 구체적으로 작명
- `docs/plans/` 하위도 동일 컨벤션 적용
- 단, `docs/ARCHITECTURE.md`는 제외하며 업데이트 시에도 네이밍을 그대로 유지
