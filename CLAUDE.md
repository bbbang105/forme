# forme

개인 올인원 PWA - 큐레이션, 캘린더, 메모

## 프로젝트 구조

pnpm 모노레포: `packages/web` (Next.js 16 PWA) + `packages/shared` (DB 스키마, 타입, 유틸)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19, TypeScript |
| DB & Auth | Supabase (Auth + PostgreSQL + RLS) |
| ORM | Drizzle ORM (`packages/shared/src/schema/`) |
| 스토리지 | Cloudflare R2 (메모 이미지) |
| 스타일링 | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 푸시알림 | web-push + Service Worker + Supabase pg_cron (리마인더) |
| RSS | feedsmith |
| DnD | @dnd-kit (core + sortable + modifiers) |
| 에디터 | TipTap + CodeBlockLowlight (lowlight 선택적 12언어 등록) |
| 패키지 관리 | pnpm workspace |
| 번들 분석 | @next/bundle-analyzer (`ANALYZE=true pnpm build`) |
| 배포 | Vercel (리전: `icn1` 서울, Hobby 플랜) |
| 스케줄링 | Vercel Cron (일 1회) + Supabase pg_cron + pg_net (고빈도) |
| AI 요약 | @google/generative-ai (GEMINI_MODEL 환경변수, 기본 gemini-2.5-flash, JSON 모드, 영상 길이별 동적 프롬프트) |
| 자막 추출 | Innertube ANDROID client API (POT 불필요, 커스텀 구현) |
| 영상 메타 | YouTube Data API v3 (duration, Shorts 필터) |
| 마크다운 렌더링 | react-markdown + remark-gfm + rehype-highlight |

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
- 공유 검증 상수: `lib/validators.ts` (DATE_REGEX, HEX_COLOR_REGEX, UUID_REGEX, TIME_REGEX, YOUTUBE_VIDEO_ID_REGEX, YOUTUBE_CHANNEL_ID_REGEX) — 모든 actions/API에서 import (인라인 정규식 금지)
- Server Actions 입력 검증: 날짜(YYYY-MM-DD), 색상(#hex), UUID, 길이 제한 등 서버측 검증 필수
- Server Actions UUID 검증: 모든 CRUD 함수의 id 파라미터에 UUID_REGEX 검증 적용
- API Route 핸들러 순서: 인증(auth) → 입력 검증(UUID 등) → 비즈니스 로직 (인증 전에 입력 검증하지 않음)
- KST 시간대: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 사용
- API 트레이싱: `withTracing()` 래퍼로 모든 API 라우트 자동 타이밍 측정
- Server Action 트레이싱: `traceAction()` + `traceQuery()` 래퍼로 DB 쿼리 성능 측정
- 무거운 컴포넌트: `next/dynamic` + `ssr: false`로 지연 로딩 (TipTap, DnD Kit, EventForm, CategoryManager 등)
- 캘린더 인터랙션: Optimistic updates 패턴, 데스크톱 2컬럼 (`lg:flex-row`), lane 기반 이벤트 배치 (hazel-admin 스타일, greedy lane 할당 + startTime 순 정렬 + 멀티데이 바 연결), 삭제 시 AlertDialog 확인 모달, 반복 일정 (매주/격주 + 요일 선택, excludedDates로 개별 삭제, recurrenceEndDate로 이후 삭제), 반복 인스턴스 개별 수정 (Google Calendar 패턴: "이 일정만 수정" → excludedDates 추가 + 단독 이벤트 생성 트랜잭션, "모든 반복 일정 수정" → 부모 이벤트 일괄 업데이트)
- 투두: DnD 드래그 순서변경 (@dnd-kit, GripVertical 핸들, 모바일 항상 표시), 밀린 투두 칩 (date < 오늘 && 미완료 → amber 칩 + "오늘로" 이동), 완료 애니메이션 (check-bounce), 빈 상태 격려 문구
- Cron 인증: `lib/cron-auth.ts` — `verifyCronSecret()` (timingSafeEqual, 길이 무관 constant-time 비교) + `getAllUserIds()` (profiles 테이블, 100명 cap, 5분 TTL 캐시) 멀티유저 패턴, 모든 cron 라우트에서 사용. 레거시 `verifyCronAuth()` (단일유저) 호환 유지
- 푸시 알림 Cron: 데일리 요약 (08:00 KST, 일정+투두 카운트), 일정 리마인더 (5분 간격, 현재~1시간 이내 윈도우, 자정 경계 대응, biweekly 격주 검증, reminderSent 즉시 업데이트, 유저별 병렬 처리)
- 모바일 PWA: viewport `maximumScale: 1, userScalable: false`, 모든 input/textarea/select `text-base`(16px) 이상 (iOS 자동 줌 방지), 크롬 스타일 pull-to-refresh (`overscroll-behavior-y: contain` + DOM 직접 조작 + 컨텐츠 translateY + 인라인 SVG 인디케이터 + `window.location.reload()`)
- Safari PWA 대응: Dialog `flex flex-col` + `inset-y-0 my-auto` 센터링 (grid+translate 금지), `body[data-scroll-locked]`에서 `overscroll-behavior-y: auto` 해제, pull-to-refresh에서 다이얼로그 열림 감지 스킵
- 큐레이션 Soft Delete: `deletedAt` 타임스탬프 기반 (NULL = 활성), 모든 SELECT에 `isNull(curationItems.deletedAt)` 필터 필수, 삭제 아이템은 DB에 유지되어 크롤 시 재수집 방지 (title dedup + unique constraint), `add-url`에서 삭제된 URL 재등록 시 UPDATE로 복원
- 큐레이션 정렬: status=read 탭에서 readAt DESC 정렬 (최근 읽은 순)
- 큐레이션 삭제: 단건 삭제 (AlertDialog 확인) + 일괄 삭제 (체크박스 선택, 100개 청크), ownership은 curationSources join으로 검증
- 큐레이션 선택 모드: 읽음 탭에서 일괄 안읽음 되돌리기 (bulk-action API, mark_unread) + 일괄 삭제, aria-live 선택 카운트, itemsRef 패턴
- 큐레이션 URL 수동 등록: POST /api/curation/add-url (preview 모드 + 저장 모드), "직접 추가" 시스템 소스 자동 생성 (manual://), OG 메타 파싱 (50KB streaming), AddUrlDialog 2단계 플로우 (가져오기→미리보기 편집→등록), INTEREST_OPTIONS 태그 클릭 토글 (최대 5개), 카테고리 선택 (AI/DEV/UXUI/ECONOMY), 즐겨찾기 바에 "직접 추가" 필터 칩
- 큐레이션 북마크 메모: InlineMemo 컴포넌트 (읽음+북마크 탭, 500자, key prop으로 외부 상태 동기화), 읽음 탭 메모 저장 시 자동 북마크 + 컬렉션 피커 자동 오픈 (비디오 패턴 동일), PATCH API 서버측 메모→자동 북마크 (명시적 isBookmarked 지정 시 덮어쓰지 않음)
- 큐레이션 북마크 컬렉션: bookmark_collections 테이블 (RLS), 컬렉션 CRUD + DnD 순서변경 (@dnd-kit/sortable, GripVertical), 피커 바텀시트, 피드 컬렉션 칩 필터 (북마크 탭 전용), IDOR 방어 (소유권 검증)
- 큐레이션 UX: 스와이프 액션 (우→읽음, 좌→삭제), 키보드 네비 (j/k/o/b, ref 기반 리스너 — 아이템 변경 시 재등록 불필요)
- 메모 캐싱: 에디터 뒤로가기 시 `router.refresh()` + MemoList initialMemos props 동기화
- Discord 웹훅: `lib/discord.ts` — URL 패턴 검증 + 5초 타임아웃 + 에러 내부 흡수
- DB 커넥션: `max: 1` (Supabase Transaction Pooler가 실제 풀 관리, 서버리스 최적)
- 성능: `serverExternalPackages`로 서버 전용 패키지 번들 제외, AVIF 이미지 포맷, 병렬 쿼리 (`Promise.all`), SW LRU 캐시 (정적 100개), SW HTML/RSC network-first (4초 타임아웃 + 캐시 폴백), 리스트 아이템 `React.memo` (CurationCard, CurationListRow, MemoCard, VideoCard)
- 에러 바운더리: 모든 (main) 페이지에 `error.tsx` 배치 (calendar, curation, memo, video), `error` prop 로깅 + 제네릭 메시지만 표출
- 접근성: 탭바 `aria-current="page"`, 검색 input `aria-label`, 이벤트 폼 색상 버튼 `focus-visible:ring-2` + `aria-label`, 폼 라벨 `htmlFor`/`id` 연결 필수, 에러 메시지 `role="alert" aria-live="polite"`, 터치 타겟 최소 44x44px (WCAG 2.5.5), 모든 커스텀 버튼 `focus-visible:ring-2`, `@utility focus-ring` CSS 유틸리티, `prefers-reduced-motion` 미디어 쿼리, 장식 아이콘 `aria-hidden="true"` (라벨 있는 버튼 내부 아이콘)
- 아이콘 통일: lucide-react 아이콘 사용 (Newspaper, CheckSquare, FileText 등)
- SSRF 방어: `lib/url-safety.ts` — IPv4/IPv6 사설 대역, IPv4-mapped IPv6, ULA(fc00::/7), Link-Local(fe80::/10) 차단
- 컴포넌트 분리: 대형 컴포넌트 → 하위 컴포넌트/훅 추출 (source-card, crawl-settings-form, calendar-header, recurrence-form, feed-filter-bar, tag-input, day-cell, lane-utils, use-calendar-state, use-editor-config, useImageUpload, LinkInput)
- 자동저장 훅: `hooks/use-auto-save.ts` — saveFnRef 패턴, Promise 기반 동시 저장 방어, detach() API, IME 컴포지션 중 저장 스킵
- 공유 유틸: `lib/format-time.ts` (formatTime, formatDuration), `lib/constants.ts` (앱 전역 상수 — 페이지네이션, 제한값, SW 재시도 설정, VIDEO_FEED_PAGE_SIZE, VIDEO_SUMMARIZE_BATCH_MAX, VIDEO_SUMMARIZING_TIMEOUT_MS)
- 공유 상수: `packages/shared/src/config/interest-options.ts` (INTEREST_OPTIONS 30개 관심 태그, 큐레이션 소스 + URL 등록에서 공통 사용, `@forme/shared/config`로 import — 클라이언트 번들 안전)
- 공유 UI: `components/ui/list-skeleton.tsx` (피드/메모 목록 스켈레톤, role="status" aria-busy)
- 캘린더 상태 훅: `use-calendar-state.ts` — 14개 상태 + 핸들러 추출, async/await 데이터 페칭
- 에디터 설정 훅: `use-editor-config.ts` — TipTap 확장 배열 useMemo로 안정적 참조
- header 아바타: 서버사이드 fetch (layout.tsx async → avatarUrl prop), 클라이언트 워터폴 제거
- SW 등록: 지수 백오프 재시도 (최대 3회, constants.ts 참조), 푸시 구독 자동 동기화 (syncPushSubscription, sessionStorage 중복 방지)
- RSS 크롤 중복 방지: 크로스소스 제목 dedup (동일 제목 → DB 미저장, curationSources join으로 유저별 기존 제목 조회)
- 유튜브 요약: video_sources (채널 소스) + video_items (수집/요약 영상, sourceId nullable — 수동 URL 추가 지원) + video_bookmark_collections (컬렉션) 테이블, 수집과 요약 분리 (수집: RSS 무료, 요약: Gemini API), @handle URL → 페이지 파싱으로 channelId 추출 (한글 핸들 decodeURIComponent 대응, 100자 제한), youtube.com/channel/ URL도 지원, SSE 스트리밍 요약 (api/curation/crawl 패턴), 자막 추출: Innertube ANDROID client (POT 불필요, WEB client는 빈 응답), 실패 시 description 폴백 (summarySource 플래그), 자막 최대 80,000자, 마크다운 렌더러 next/dynamic 지연 로딩, 최대 5개 배치 요약 (VIDEO_SUMMARIZE_BATCH_MAX), YouTube Data API v3로 duration 조회 → Shorts/2분 미만 필터, GEMINI_MODEL 환경변수 (기본 gemini-2.5-flash), 영상 길이별 동적 프롬프트 (10분 미만/10~30분/30~60분/60분+ 분량 가이드), 자막 URL SSRF 방어 (isSafeUrl), videoId 정규식 검증, 북마크 컬렉션 (DnD 순서변경 + 피커 바텀시트 + 피드 칩 필터), optimistic updates + 에러 롤백
- 유튜브 URL 직접 추가: 피드 탭 태그 칩 우측 + 버튼 → AddUrlDialog (SSE 원스텝: 메타 → 자막 → 요약 → DB), 기존 영상 있으면 트랜잭션으로 삭제 후 재등록, cancel 시 orphan DB 정리
- 유튜브 피드 2탭 구조: "피드" (세그먼트 탭, 요약 완료 영상) + "생성" (수집/요약 실행), 피드 탭 내 상태 칩 (안읽음/읽음/북마크 — 큐레이션 동일 패턴), 피드 탭 검색 (escapeIlike + raw SQL ESCAPE), 탭 전환 시 하위 필터 전체 초기화, itemsRef 패턴 (useCallback + ref로 stale closure 방지), 읽음 탭 readAt DESC 정렬 (최근 읽은 순)
- 유튜브 선택 모드: 피드 탭 상태 칩 우측 "선택" 버튼, 생성 탭 수집 라인 우측 "선택" 버튼, 일괄 삭제 (bulk-action API), 읽음 탭에서 일괄 안읽음 되돌리기 (mark_unread)
- 유튜브 즐겨찾기 소스: DnD 순서변경 (@dnd-kit/sortable, GripVertical 핸들, /api/video/sources/reorder 배치 업데이트)
- 큐레이션 필터 순서: 카테고리 세그먼트 → 상태 칩 (+ statusActions 슬롯) → 검색 → 즐겨찾기 소스 → 정렬, 헤더 제거 (선택/소스관리 버튼을 상태 칩 우측에 배치)
- 테스트: Vitest + `vi.hoisted()` Proxy 기반 DB 목 패턴 (`packages/web/src/__tests__/`)

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `packages/web/src/proxy.ts` | Next.js 16 proxy (인증 리다이렉트, `/api/cron/` 우회 허용) |
| `packages/web/src/app/(main)/layout.tsx` | 인증 레이아웃 (async 서버 컴포넌트, 아바타 서버사이드 fetch, LayoutShell + 탭바) |
| `packages/web/src/app/(auth)/login/page.tsx` | Discord 로그인 |
| `packages/web/src/app/auth/callback/route.ts` | OAuth 콜백 (open redirect 방어) |
| `packages/web/src/lib/supabase/middleware.ts` | 세션 갱신 유틸 |
| `packages/web/src/lib/supabase/server.ts` | 서버 Supabase 클라이언트 |
| `packages/web/src/components/layout/tab-bar.tsx` | 하단 탭바 (4탭: 큐레이션/유튜브/캘린더/메모) |
| `packages/web/src/components/layout/header.tsx` | 헤더 (forme 로고 + 다크모드 토글 + 서버 전달 avatarUrl prop) |
| `packages/web/src/components/ui/logo.tsx` | 레트로 {f} 픽토그램 로고마크 (useId 패턴 ID, 다크모드 대응) |
| `packages/shared/src/schema/calendar-events.ts` | 캘린더 이벤트 스키마 (반복: recurrenceType/Days/EndDate, excludedDates, reminderSent) |
| `packages/shared/src/schema/todos.ts` | 투두 스키마 |
| `packages/shared/src/schema/` | Drizzle DB 스키마 (전체) |
| `packages/shared/src/db.ts` | DB 싱글톤 (SSL 강제, max:1 서버리스 최적) |
| `packages/web/src/lib/crawl-feed.ts` | RSS 크롤 (feedsmith, since 필터, SSRF 방어, 크로스소스 제목 dedup) |
| `packages/web/src/lib/validators.ts` | 공유 검증 정규식 (DATE, HEX_COLOR, UUID, TIME, YOUTUBE_VIDEO_ID, YOUTUBE_CHANNEL_ID) |
| `packages/web/src/lib/url-safety.ts` | SSRF 방어 유틸 (IPv4/IPv6/ULA/Link-Local 차단) |
| `packages/web/src/lib/auth.ts` | 인증 유틸 (React.cache 기반 getAuthUser) |
| `packages/web/src/lib/logger.ts` | 구조화 로거 (withTracing, traceAction, traceQuery) |
| `packages/web/src/lib/r2.ts` | Cloudflare R2 업로드/삭제 유틸 (Cache-Control 포함) |
| `packages/web/src/components/layout/layout-shell.tsx` | 클라이언트 레이아웃 셸 (PullToRefresh) |
| `packages/web/src/components/layout/pull-to-refresh.tsx` | 크롬 스타일 Pull-to-Refresh (컨텐츠 translateY + 인라인 SVG 인디케이터) |
| `packages/web/src/hooks/use-pull-to-refresh.ts` | Pull-to-Refresh 훅 (DOM 직접 조작, 스크롤 컨테이너 감지, window.location.reload, 다이얼로그 열림 감지 스킵) |
| `packages/web/src/lib/push.ts` | 푸시 알림 발송 (sendPushToUser) |
| `packages/web/src/app/api/curation/add-url/route.ts` | 큐레이션 URL 수동 등록 API (preview/save 2모드, OG 메타 파싱, "직접 추가" 시스템 소스) |
| `packages/web/src/components/features/curation/add-url-dialog.tsx` | URL 직접 추가 다이얼로그 (2단계 미리보기 폼, INTEREST_OPTIONS 태그 토글, 카테고리 선택) |
| `packages/web/src/app/api/curation/crawl/route.ts` | SSE 수동 크롤 API |
| `packages/web/src/app/api/curation/sources/reorder/route.ts` | 즐겨찾기 소스 순서 배치 업데이트 |
| `packages/web/src/lib/cron-auth.ts` | Cron 인증 유틸 (verifyCronSecret + getAllUserIds 멀티유저, constant-time safeCompare, 5분 TTL 캐시, 레거시 verifyCronAuth 호환) |
| `packages/web/src/app/api/cron/curation/route.ts` | Cron 자동 크롤 + 푸시 알림 (verifyCronSecret 멀티유저 인증, 응답에 내부 상세 미노출) |
| `packages/web/src/app/api/cron/calendar-daily/route.ts` | Cron 데일리 요약 푸시 (08:00 KST, 일정+투두 카운트, reminderSent 리셋) |
| `packages/web/src/app/api/cron/calendar-reminder/route.ts` | 일정 리마인더 푸시 (Supabase pg_cron 5분 호출, 현재~1시간 이내 윈도우, 자정 경계 대응, biweekly 검증, GET+POST 지원) |
| `supabase/pg-cron-setup.sql` | Supabase pg_cron + pg_net 설정 SQL (calendar-reminder 5분 스케줄, 플레이스홀더 가드) |
| `packages/web/src/app/api/push/subscribe/route.ts` | 푸시 구독 등록/해제/조회 |
| `packages/web/src/lib/discord.ts` | Discord 웹훅 전송 유틸 (sendDiscordMessage, sendDiscordEmbed) |
| `packages/web/src/components/features/memo/memo-editor-lazy.tsx` | MemoEditor 지연 로딩 래퍼 (next/dynamic, ssr: false) |
| `packages/web/src/components/features/curation/mini-card-thumbnail.tsx` | 대시보드 큐레이션 썸네일 (클라이언트 onError 폴백) |
| `packages/web/public/sw.js` | Service Worker (PWA + 푸시 + 전략별 캐싱 + LRU trimCache) |
| `packages/web/src/app/manifest.ts` | PWA 매니페스트 (MetadataRoute) |
| `packages/web/src/lib/actions/calendar.ts` | 캘린더 이벤트 Server Actions (CRUD + 반복 확장 + excludeRecurringDate/deleteRecurringAfter) |
| `packages/web/src/lib/actions/todos.ts` | 투두 Server Actions (CRUD + 토글 + DnD 벌크 reorder + 입력 검증) |
| `packages/web/src/components/features/calendar/calendar-client.tsx` | 캘린더 메인 클라이언트 (useCalendarState 훅, 월간뷰, optimistic updates, 데스크톱 2컬럼) |
| `packages/web/src/components/features/calendar/use-calendar-state.ts` | 캘린더 상태 훅 (14개 상태 + 이벤트/투두 핸들러, async 데이터 페칭) |
| `packages/web/src/components/features/calendar/calendar-grid.tsx` | 캘린더 그리드 (DayCell + lane-utils import) |
| `packages/web/src/components/features/calendar/day-cell.tsx` | 날짜 셀 컴포넌트 (React.memo, ARIA 접근성, 이벤트 dot/lane 렌더링) |
| `packages/web/src/components/features/calendar/lane-utils.ts` | lane 배치 알고리즘 (greedy lane 할당, startTime 정렬, 멀티데이 바 연결, JSDoc 문서화) |
| `packages/web/src/components/features/calendar/todo-list.tsx` | 투두 리스트 (DnD 순서변경, optimistic 추가/토글/삭제, 완료 애니메이션, 빈 상태 격려 문구) |
| `packages/web/src/components/features/calendar/calendar-header.tsx` | 캘린더 헤더 (월 네비게이션, 오늘 버튼) |
| `packages/web/src/components/features/calendar/event-form.tsx` | 이벤트 폼 (생성/수정/삭제, optimistic 콜백, 종료시간 자동동기화, 모바일 flex 스크롤 레이아웃) |
| `packages/web/src/components/features/calendar/recurrence-form.tsx` | 반복 일정 설정 UI (매주/격주, 요일 선택, 종료일) |
| `packages/web/src/components/features/calendar/event-list.tsx` | 이벤트 목록 (선택 날짜별 필터링, 반복 삭제 3옵션 다이얼로그, 빈 상태 격려 문구) |
| `packages/web/src/components/features/calendar/category-manager.tsx` | 이벤트 카테고리 관리 다이얼로그 |
| `packages/web/src/components/features/calendar/types.ts` | 캘린더 공유 타입 (CalendarEvent, Todo, EventCategory, EventFormProps discriminated union) |
| `packages/shared/src/schema/event-categories.ts` | 이벤트 카테고리 스키마 |
| `packages/web/src/lib/actions/categories.ts` | 카테고리 Server Actions (CRUD) |
| `packages/web/src/components/features/calendar/dashboard-calendar.tsx` | 대시보드 캘린더 위젯 (오늘 할일 + 다가오는 일정) |
| `packages/web/src/hooks/use-swipe.ts` | 터치 스와이프 훅 (모바일 월 이동) |
| `packages/shared/src/schema/memos.ts` | 메모 스키마 (JSONB content + contentText + tags) |
| `packages/web/src/lib/actions/memos.ts` | 메모 Server Actions (CRUD + 검색 + 고정 + 페이지네이션 + 태그 + TipTap JSON 검증) |
| `packages/web/src/hooks/use-auto-save.ts` | 자동저장 훅 (debounce, flush on blur/visibility, Promise 동시저장 방어) |
| `packages/web/src/components/features/memo/memo-editor.tsx` | TipTap 에디터 (useEditorConfig + useAutoSave 훅, 고정/삭제, 전체화면 fixed 레이아웃) |
| `packages/web/src/components/features/memo/use-editor-config.ts` | TipTap 확장 설정 훅 (useMemo 안정 참조, 12언어 코드 하이라이트) |
| `packages/web/src/components/features/memo/tag-input.tsx` | 태그 입력 컴포넌트 (추가/삭제, MAX_TAGS=5) |
| `packages/web/src/components/features/memo/memo-toolbar.tsx` | 에디터 서식 툴바 (useImageUpload 훅 + LinkInput 분리, B/I/U/S, H1-H3, 리스트, 체크리스트, 링크, 이미지, 인라인코드, 코드블록) |
| `packages/web/src/components/features/memo/image-block.tsx` | 커스텀 이미지 확장 (React NodeView: 리사이즈, 삭제 버튼, 캡션) |
| `packages/web/src/components/features/memo/image-drop-plugin.ts` | 이미지 드래그앤드롭/붙여넣기 업로드 ProseMirror 플러그인 |
| `packages/web/src/components/features/memo/code-block-view.tsx` | 코드블록 React NodeView (언어 셀렉터 드롭다운, 15개 언어) |
| `packages/web/src/components/features/memo/memo-list.tsx` | 메모 목록 (서버 검색, 하이라이트, 정렬, 태그 필터, 페이지네이션) |
| `packages/web/src/components/features/memo/memo-card.tsx` | 메모 카드 (제목+날짜+미리보기, React.memo, 메모이즈드 RegExp 하이라이트) |
| `packages/web/src/components/features/memo/dashboard-memo.tsx` | 대시보드 최근 메모 위젯 (에러 폴백) |
| `packages/web/src/components/features/memo/task-list-sort.ts` | ProseMirror 플러그인 (체크된 아이템 하단 자동정렬) |
| `packages/web/src/app/api/memo/image/route.ts` | 메모 이미지 R2 업로드 API (5MB, JPEG/PNG/GIF/WebP) |
| `packages/web/src/components/features/curation/source-card.tsx` | 소스 카드 (DnD, 즐겨찾기, 활성/비활성 토글) |
| `packages/web/src/components/features/curation/crawl-settings-form.tsx` | 크롤 설정 폼 (기간 선택, 수집 시작) |
| `packages/web/src/components/features/curation/feed-filter-bar.tsx` | 피드 필터 바 (카테고리 → 상태칩+statusActions → 검색 → 즐겨찾기 → 정렬 순서) |
| `packages/web/src/components/features/curation/mini-card-link.tsx` | 대시보드 큐레이션 클릭 시 읽음 처리 래퍼 |
| `packages/web/src/app/api/curation/[id]/route.ts` | 큐레이션 아이템 PATCH (읽음/북마크/메모/컬렉션) + DELETE (단건 삭제, ownership join 검증) |
| `packages/web/src/app/api/curation/bulk-delete/route.ts` | 큐레이션 일괄 삭제 (POST, max 100개, UUID 전수 검증) |
| `packages/web/src/app/api/curation/bulk-action/route.ts` | 큐레이션 일괄 액션 (mark_unread/delete, max 100개, ownership join 검증) |
| `packages/web/src/hooks/use-swipe-action.ts` | 터치 스와이프 제스처 훅 (axis-lock, damped swipe, ref 기반 콜백, 타이머 cleanup) |
| `packages/web/src/lib/format-time.ts` | 공유 시간 포맷 유틸 (formatTime, formatDuration) |
| `packages/web/src/lib/constants.ts` | 앱 전역 상수 (페이지네이션, 제한값, SW 재시도 설정) |
| `packages/web/src/components/ui/list-skeleton.tsx` | 공유 목록 스켈레톤 (role="status", aria-busy, count/showThumbnail props) |
| `packages/shared/src/schema/bookmark-collections.ts` | 북마크 컬렉션 스키마 (id, userId, name, color, sortOrder, RLS) |
| `packages/web/src/lib/actions/collections.ts` | 컬렉션 Server Actions (CRUD + DnD reorder + assignCollection, 소유권 검증) |
| `packages/web/src/components/features/curation/collection-manager.tsx` | 컬렉션 관리 다이얼로그 (DnD sortable 순서변경, 색상/이름 편집, 삭제) |
| `packages/web/src/components/features/curation/collection-picker.tsx` | 컬렉션 선택 바텀시트 (ARIA listbox, 키보드 접근성) |
| `packages/web/src/components/sw-register.tsx` | Service Worker 등록 (지수 백오프 재시도 최대 3회) + 푸시 구독 자동 동기화 (syncPushSubscription) |
| `packages/shared/src/schema/video-sources.ts` | 유튜브 채널 소스 스키마 |
| `packages/shared/src/schema/video-items.ts` | 유튜브 영상 수집/요약 스키마 (status: collected/summarizing/summarized/failed) |
| `packages/web/src/lib/gemini.ts` | Gemini AI 요약 유틸 (싱글톤 패턴, JSON 스키마 모드, transcript/description 프롬프트) |
| `packages/web/src/lib/youtube-transcript.ts` | YouTube 자막 추출 (Innertube ANDROID client, POT 불필요, 언어 폴백 ko>en>first + description 폴백, SSRF 방어, 10초 타임아웃) |
| `packages/web/src/lib/youtube-api.ts` | YouTube Data API v3 유틸 (fetchVideoDurations, videoId 검증, ISO 8601 duration 파싱) |
| `packages/web/src/app/api/video/sources/route.ts` | 유튜브 채널 소스 CRUD (@handle + /channel/ URL 지원) |
| `packages/web/src/app/api/video/collect/route.ts` | RSS 영상 수집 SSE (기간 필터, videoId 중복 스킵, Shorts 2분 미만 필터, max 50 소스) |
| `packages/web/src/app/api/video/[id]/route.ts` | 영상 아이템 PATCH (읽음/북마크/메모/컬렉션) + DELETE (userId 검증) |
| `packages/web/src/app/api/video/summarize/route.ts` | 영상 요약 SSE API (자막 추출 → Gemini → DB, duration 기반 프롬프트) |
| `packages/web/src/app/api/video/add-url/route.ts` | URL 직접 추가 SSE API (메타 → 자막 → 요약 원스텝, 트랜잭션 delete+insert, cancel 정리) |
| `packages/web/src/app/api/video/bulk-action/route.ts` | 영상 일괄 액션 (mark_unread/delete, max 100개, userId 스코핑) |
| `packages/web/src/app/api/video/sources/reorder/route.ts` | 즐겨찾기 소스 순서 배치 업데이트 (favoriteOrder) |
| `packages/web/src/app/api/video/items/route.ts` | 영상 피드 목록 (tab=feed/create, status=unread/read/bookmarked, 읽음 탭 readAt DESC 정렬, 검색 escapeIlike, 커서 페이지네이션) |
| `packages/web/src/components/features/video/video-feed.tsx` | 유튜브 피드 메인 (2탭 세그먼트 + 상태 칩 + 검색 + 무한스크롤 + 선택 모드 + URL 추가, itemsRef/updateFilterRef 패턴, useCallback 최적화) |
| `packages/web/src/components/features/video/video-card.tsx` | 영상 카드 (React.memo, flex-col 액션 버튼, 인라인 메모, 선택 모드 시 액션 숨김) |
| `packages/web/src/components/features/video/video-source-bar.tsx` | 채널 소스 관리 다이얼로그 (추가/삭제/즐겨찾기/태그, 즐겨찾기 DnD 순서변경) |
| `packages/web/src/components/features/video/add-url-dialog.tsx` | URL 직접 추가 다이얼로그 (SSE 진행 표시, aria-live, role="progressbar") |
| `packages/web/src/components/features/video/video-collection-manager.tsx` | 비디오 컬렉션 관리 다이얼로그 (DnD sortable 순서변경, 색상/이름 편집, 삭제) |
| `packages/web/src/components/features/video/video-collection-picker.tsx` | 비디오 컬렉션 선택 바텀시트 (ARIA listbox, 키보드 접근성, 새 컬렉션 인라인 생성) |
| `packages/web/src/components/features/video/collect-progress.tsx` | 수집 진행 SSE 표시 (role="status" aria-live="polite") |
| `packages/web/src/components/features/video/markdown-renderer.tsx` | 마크다운 렌더러 (dynamic import, prose 스타일링) |
| `packages/web/src/app/(main)/video/[id]/page.tsx` | 영상 상세 페이지 (썸네일 + 메타 + 마크다운 요약) |
| `packages/web/src/lib/actions/video-collections.ts` | 비디오 컬렉션 Server Actions (CRUD + DnD reorder + assignCollection, 소유권 검증) |
| `packages/shared/src/schema/video-bookmark-collections.ts` | 비디오 북마크 컬렉션 스키마 (id, userId, name, color, sortOrder, RLS) |
| `supabase/video-rls.sql` | video_sources + video_items + video_bookmark_collections RLS 정책 |

## 인증 구조

Discord OAuth → Supabase Auth → `proxy.ts`에서 세션 자동 갱신 (Next.js 16 방식).
RLS로 `auth.uid() = user_id` 강제. profiles 테이블로 멀티유저 확장 대비.
보안: CSP + HSTS + Permissions-Policy 헤더, open redirect 방어 적용.

## 디자인 시스템

study-admin 스타일: Sky Blue `#0ea5e9` 포인트, Pretendard 폰트, 다크모드 지원 (next-themes).

## 환경 변수

`.env.local` 참조. Supabase(URL, Anon Key, Service Key), R2(Access Key, Secret, Bucket), VAPID 키, Discord OAuth(Client ID/Secret), Cron(CRON_SECRET, CRON_USER_ID), GEMINI_API_KEY, GEMINI_MODEL(기본 gemini-2.5-flash), YOUTUBE_API_KEY.

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
| `docs/plans/26-03-04-dashboard-redesign.md` | 대시보드 리디자인 설계 (히스토리 — 날씨/게이미피케이션 제거됨) |
| `docs/plans/26-03-05-calendar-redesign.md` | 캘린더 리디자인 설계 (카테고리+2컬럼 레이아웃) |
| `docs/plans/26-03-05-performance-optimization.md` | PWA 성능 최적화 (리전, 번들, 렌더링, 워터폴) |
| `docs/26-03-08-safari-dialog-scroll-fix.md` | Safari 다이얼로그 스크롤 수정 (Chrome vs Safari 차이, 해결책) |
| `docs/plans/26-03-08-calendar-push-ux-design.md` | 캘린더 푸시알림 + UX 개선 설계 (데일리 요약, 리마인더, 밀린 투두, 애니메이션) |
| `docs/plans/26-03-12-bookmark-collections.md` | 북마크 컬렉션 기능 설계 (스키마, CRUD, DnD, 피드 필터) |
| `docs/plans/26-03-26-curation-url-add-memo-flow.md` | 큐레이션 URL 수동 등록 + 메모→북마크 플로우 설계 |

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-03-03-system-architecture.md`
- 설명은 다른 문서와 구분될 정도로 구체적으로 작명
- `docs/plans/` 하위도 동일 컨벤션 적용
- 단, `docs/ARCHITECTURE.md`는 제외하며 업데이트 시에도 네이밍을 그대로 유지
