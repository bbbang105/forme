# forme - 개인 올인원 PWA 설계 문서

> 작성일: 2026-03-03
> 상태: 승인됨

## 개요

나만을 위한 올인원 PWA. 큐레이션, 캘린더, 메모, 팟캐스트를 하나의 앱에서 관리.

## 기술 스택

| 카테고리 | 기술 |
|----------|------|
| 프레임워크 | Next.js 16 + React 19 + TypeScript |
| DB & Auth | Supabase (Auth + PostgreSQL + RLS) |
| ORM | Drizzle ORM |
| 스토리지 | Cloudflare R2 (팟캐스트 음성) |
| 스타일링 | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 폰트 | Pretendard |
| 푸시알림 | web-push |
| RSS | feedsmith |
| 에디터 | TipTap |
| 패키지 관리 | pnpm workspace |
| 배포 | Vercel |

## 프로젝트 구조

```
forme/
├── packages/
│   ├── web/                    ← Next.js 16 PWA (port 3000)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/     ← 로그인, 콜백
│   │   │   │   ├── (main)/     ← 인증 필요한 메인 영역
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── curation/
│   │   │   │   │   ├── calendar/
│   │   │   │   │   ├── memo/
│   │   │   │   │   └── podcast/
│   │   │   │   └── api/
│   │   │   ├── components/
│   │   │   │   ├── ui/         ← shadcn/ui
│   │   │   │   ├── layout/     ← 탭바, 헤더
│   │   │   │   └── features/   ← 기능별 컴포넌트
│   │   │   └── lib/
│   │   │       ├── supabase/   ← 클라이언트, 서버, 미들웨어
│   │   │       └── actions/    ← Server Actions
│   │   └── public/
│   │       ├── sw.js           ← Service Worker
│   │       └── manifest.json   ← PWA 매니페스트
│   └── shared/                 ← 공유 패키지
│       ├── src/
│       │   ├── schema/         ← Drizzle ORM 스키마
│       │   ├── types/          ← 공유 타입
│       │   └── utils/          ← 유틸리티
│       └── package.json
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

## 인증 설계

### Discord OAuth (Supabase Auth)

```
사용자 → "Discord로 로그인" 클릭
  → Supabase OAuth → Discord 인증
  → /auth/callback → 세션 발급
  → /dashboard 리다이렉트
```

- Supabase Auth가 토큰 관리 전담
- 미들웨어에서 매 요청마다 세션 갱신 → 14일 유지 (JWT expiry 설정)
- RLS로 `auth.uid() = user_id` 강제 → 멀티 유저 확장 대비

### profiles 테이블

```sql
profiles
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - discord_id
  - discord_username
  - display_name
  - avatar_url
  - created_at, updated_at
```

## 네비게이션

모바일 PWA 최적화된 하단 탭바.

```
┌─────────────────────────┐
│                         │
│      콘텐츠 영역         │
│                         │
├─────────────────────────┤
│  홈  큐레  캘린  메모  팟캐 │
└─────────────────────────┘
```

팟캐스트 재생 중일 때는 탭바 위에 미니 플레이어 표시.

```
┌─────────────────────────┐
│      콘텐츠 영역         │
├─────────────────────────┤
│ ▶ AI 트렌드 리뷰  02:31  │  ← 미니 플레이어
├─────────────────────────┤
│  홈  큐레  캘린  메모  팟캐 │  ← 탭바
└─────────────────────────┘
```

## 기능별 설계

### 1. 대시보드 (메인 진입점)

로그인 후 첫 화면. 각 기능의 요약을 한 눈에 표시.

- 오늘의 할 일 (투두 요약)
- 최신 큐레이션 (최근 3건)
- 최근 팟캐스트 (마지막 에피소드)
- 다가오는 일정 (캘린더 이벤트)
- 각 섹션 클릭 시 해당 탭으로 이동
- Server Component로 데이터 fetch

### 2. 큐레이션

study-admin 큐레이션 구조 기반.

**기능:**
- 카테고리 탭: 전체 / AI / UXUI / 경제
- 정렬: 최신순 (초기), 추후 추천순 추가
- 무한스크롤: 커서 기반 페이지네이션
- 카드 UI: 썸네일 + 제목 + 출처 + 날짜 + 태그
- RSS 수집: feedsmith 파싱 + Vercel Cron 주기적 수집

**DB:**

```sql
curation_sources
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - name, url, rss_url
  - category (ai / uxui / economy)
  - is_active, created_at

curation_items
  - id (UUID, PK)
  - source_id (FK → curation_sources)
  - title, url, description
  - thumbnail_url, published_at
  - category, tags (text[])
  - is_read (boolean)
  - collected_at
```

### 3. 캘린더 + 투두리스트

**캘린더:** 월간 뷰만. 날짜 클릭 시 해당 날짜의 일정/투두 표시.

**투두리스트:** 날짜별 할 일. 체크박스로 완료 처리.

**리마인더:** 5분 단위 Vercel Cron → web-push 알림 발송.

```
Vercel Cron (5분마다)
  → reminder_at <= NOW() AND reminder_sent = false 조회
  → web-push로 알림 발송
  → reminder_sent = true 업데이트
```

**DB:**

```sql
calendar_events
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - title, start_date, end_date
  - color, description
  - created_at, updated_at

todos
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - date, content
  - is_completed (boolean)
  - sort_order
  - reminder_at (nullable, timestamptz)
  - reminder_sent (boolean, default false)
  - created_at, updated_at

push_subscriptions
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - endpoint, p256dh, auth
  - is_active, created_at, updated_at
```

### 4. 메모

iOS 메모앱 스타일. 심플하게.

**기능:**
- 목록: 제목 + 미리보기 텍스트 + 수정일
- 에디터: TipTap 리치 텍스트
- 고정(pin) 기능
- 초기에는 폴더 없이 flat 목록

**DB:**

```sql
memos
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - title
  - content (jsonb, TipTap 포맷)
  - content_text (text, 검색용 plain text)
  - is_pinned (boolean, default false)
  - created_at, updated_at
```

### 5. 팟캐스트

수동 업로드 + 반자동(notebooklm-podcast-automator) 지원.

**기능:**
- 에피소드 목록: 카드 UI (제목 + 날짜 + 재생시간 + 소스 태그)
- 플레이어: 하단 미니 플레이어 (탭바 위 고정)
- 재생 컨트롤: 재생/일시정지, 15초 앞뒤로
- 업로드: mp3/m4a → Cloudflare R2
- 소스 메타데이터: 기반 글/논문/영상 URL 기록

**DB:**

```sql
podcast_episodes
  - id (UUID, PK)
  - user_id (FK → auth.users)
  - title, description
  - audio_url (text, R2 URL)
  - duration (integer, seconds)
  - source_urls (text[])
  - source_type (article / paper / youtube / mixed)
  - published_at
  - created_at
```

**스토리지:** Cloudflare R2 (S3 호환, 무료 10GB)

## 워크트리 구조

```
main ← 공통 기반 (Auth + 레이아웃 + PWA)
 ├── feature/curation       ← 큐레이션
 ├── feature/calendar-todo   ← 캘린더 + 투두 + 리마인더
 ├── feature/memo            ← 메모
 └── feature/podcast         ← 팟캐스트 플레이어 + 업로드
```

## 디자인 시스템

study-admin 스타일 기반.

- 포인트 컬러: Sky Blue `#0ea5e9`
- 폰트: Pretendard
- 배경: 화이트 (라이트) / 차콜 (다크)
- 글래스모피즘: `backdrop-blur-sm`
- 컴포넌트: shadcn/ui + Radix UI
- 다크모드 지원 (next-themes)

## 외부 서비스 설정 필요

1. Supabase 프로젝트 생성 (Auth + DB)
2. Discord OAuth 앱 등록
3. Cloudflare R2 버킷 생성
4. Vercel 프로젝트 연결
5. VAPID 키 생성 (web-push용)
