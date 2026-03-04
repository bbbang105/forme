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
| 푸시알림 | web-push + Service Worker |
| RSS | feedsmith |
| DnD | @dnd-kit (core + sortable) |
| 에디터 | TipTap (메모) |
| 패키지 관리 | pnpm workspace |
| 배포 | Vercel |

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
- 인증 필요 페이지 → `(main)` route group, 비인증 → `(auth)` route group
- DB 접근 시 RLS 의존 (`auth.uid() = user_id`), 추가 권한 체크 불필요
- 스타일: Tailwind 유틸리티 클래스, 하드코딩 색상 금지 (CSS 변수 사용)
- 컴포넌트: shadcn/ui 기반, `components/ui/`에 위치
- Server Actions 입력 검증: 날짜(YYYY-MM-DD), 색상(#hex), 길이 제한 등 서버측 검증 필수
- KST 시간대: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 사용
- 테스트: Vitest + `vi.hoisted()` Proxy 기반 DB 목 패턴 (`packages/web/src/__tests__/`)

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `packages/web/src/proxy.ts` | Next.js 16 proxy (인증 리다이렉트) |
| `packages/web/src/app/(main)/layout.tsx` | 인증 레이아웃 + 하단 탭바 |
| `packages/web/src/app/(auth)/login/page.tsx` | Discord 로그인 |
| `packages/web/src/app/auth/callback/route.ts` | OAuth 콜백 (open redirect 방어) |
| `packages/web/src/lib/supabase/middleware.ts` | 세션 갱신 유틸 |
| `packages/web/src/lib/supabase/server.ts` | 서버 Supabase 클라이언트 |
| `packages/web/src/components/layout/tab-bar.tsx` | 하단 탭바 (5탭) |
| `packages/web/src/components/layout/header.tsx` | 헤더 (forme 로고 + 다크모드 토글) |
| `packages/web/src/components/ui/logo.tsx` | forme 워드마크 로고 (showMark 제거, 워드마크 전용) |
| `packages/shared/src/schema/calendar-events.ts` | 캘린더 이벤트 스키마 |
| `packages/shared/src/schema/todos.ts` | 투두 스키마 |
| `packages/shared/src/schema/` | Drizzle DB 스키마 (전체) |
| `packages/shared/src/db.ts` | DB 싱글톤 (SSL 강제) |
| `packages/web/src/lib/crawl-feed.ts` | RSS 크롤 (feedsmith, since 필터, SSRF 방어) |
| `packages/web/src/lib/url-safety.ts` | SSRF 방어 유틸 |
| `packages/web/src/lib/r2.ts` | Cloudflare R2 업로드/삭제 유틸 |
| `packages/web/src/lib/push.ts` | 푸시 알림 발송 (sendPushToUser) |
| `packages/web/src/lib/greetings.ts` | 대시보드 인사 문구 (100개 랜덤) |
| `packages/web/src/app/api/curation/crawl/route.ts` | SSE 수동 크롤 API |
| `packages/web/src/app/api/curation/sources/reorder/route.ts` | 즐겨찾기 소스 순서 배치 업데이트 |
| `packages/web/src/app/api/cron/curation/route.ts` | Cron 자동 크롤 + 푸시 알림 |
| `packages/web/src/app/api/podcast/upload/route.ts` | 팟캐스트 오디오 R2 업로드 |
| `packages/web/src/app/api/podcast/episodes/route.ts` | 팟캐스트 에피소드 CRUD |
| `packages/web/src/app/api/push/subscribe/route.ts` | 푸시 구독 등록/해제/조회 |
| `packages/web/src/components/features/podcast/player-context.tsx` | 팟캐스트 플레이어 (localStorage 이어듣기) |
| `packages/web/public/sw.js` | Service Worker (PWA + 푸시 + network-first 캐시) |
| `packages/web/src/app/manifest.ts` | PWA 매니페스트 (MetadataRoute) |
| `packages/web/src/lib/actions/calendar.ts` | 캘린더 이벤트 Server Actions (CRUD + 입력 검증) |
| `packages/web/src/lib/actions/todos.ts` | 투두 Server Actions (CRUD + 토글 + 입력 검증) |
| `packages/web/src/components/features/calendar/calendar-client.tsx` | 캘린더 메인 클라이언트 (월간뷰, 스와이프, 키보드 내비) |
| `packages/web/src/components/features/calendar/calendar-grid.tsx` | 캘린더 그리드 (날짜 셀, 이벤트/투두 도트) |
| `packages/web/src/components/features/calendar/todo-list.tsx` | 투두 리스트 (추가/토글/삭제, IME 처리) |
| `packages/web/src/components/features/calendar/event-form.tsx` | 이벤트 폼 (생성/수정/삭제 확인 다이얼로그) |
| `packages/web/src/components/features/calendar/event-list.tsx` | 이벤트 목록 (선택 날짜별 필터링) |
| `packages/web/src/components/features/calendar/dashboard-calendar.tsx` | 대시보드 캘린더 위젯 (오늘 할일 + 다가오는 일정) |
| `packages/web/src/hooks/use-swipe.ts` | 터치 스와이프 훅 (모바일 월 이동) |
| `packages/shared/src/schema/memos.ts` | 메모 스키마 (JSONB content + contentText + tags) |
| `packages/web/src/lib/actions/memos.ts` | 메모 Server Actions (CRUD + 검색 + 고정 + 페이지네이션 + 태그 + TipTap JSON 검증) |
| `packages/web/src/components/features/memo/memo-editor.tsx` | TipTap 에디터 (자동저장, 고정/삭제, 태그, 이미지, 에러 재시도) |
| `packages/web/src/components/features/memo/memo-toolbar.tsx` | 에디터 서식 툴바 (B/I/U/S, H1-H3, 리스트, 체크리스트, 링크, 이미지) |
| `packages/web/src/components/features/memo/memo-list.tsx` | 메모 목록 (서버 검색, 하이라이트, 정렬, 태그 필터, 페이지네이션) |
| `packages/web/src/components/features/memo/memo-card.tsx` | 메모 카드 (제목+날짜+미리보기, React.memo) |
| `packages/web/src/components/features/memo/dashboard-memo.tsx` | 대시보드 최근 메모 위젯 (에러 폴백) |
| `packages/web/src/components/features/memo/task-list-sort.ts` | ProseMirror 플러그인 (체크된 아이템 하단 자동정렬) |
| `packages/web/src/app/api/memo/image/route.ts` | 메모 이미지 R2 업로드 API (5MB, JPEG/PNG/GIF/WebP) |

## 인증 구조

Discord OAuth → Supabase Auth → `proxy.ts`에서 세션 자동 갱신 (Next.js 16 방식).
RLS로 `auth.uid() = user_id` 강제. profiles 테이블로 멀티유저 확장 대비.
보안: CSP + HSTS + Permissions-Policy 헤더, open redirect 방어 적용.

## 디자인 시스템

study-admin 스타일: Sky Blue `#0ea5e9` 포인트, Pretendard 폰트, 다크모드 지원 (next-themes).

## 환경 변수

`.env.local` 참조. Supabase(URL, Anon Key, Service Key), R2(Access Key, Secret, Bucket), VAPID 키, Discord OAuth(Client ID/Secret).

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
