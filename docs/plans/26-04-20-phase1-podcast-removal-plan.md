# Phase 1 실행 플랜 — 팟캐스트 + 게이미피케이션 제거

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팟캐스트 기능과 게이미피케이션(날씨/미션/출석/인사) 요소를 forme 앱에서 완전히 제거하고, 대시보드를 정보성 위젯(최근 피드 + 최근 유튜브 요약 + 다가오는 일정) 위주로 재구성한다.

**Architecture:** 상위 참조(import) 파일을 먼저 수정한 뒤 하위 파일을 삭제하는 topological 순서로 진행한다. 각 태스크는 컴파일이 그린인 상태로 커밋한다. DB 스키마 삭제는 Drizzle 마이그레이션으로 처리하고, R2 오디오 파일은 실행 후 수동 정리한다.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase, pnpm workspace

**Related Spec:** `docs/plans/26-04-20-podcast-removal-and-feed-rename.md`

**Branch:** `feature/remove-podcast-gamification` (이미 생성됨)

---

## 파일 구조 변경 요약

### 신규
- `packages/web/src/components/features/video/dashboard-video.tsx` — 대시보드 최근 유튜브 요약 위젯

### 수정
- `packages/web/src/app/(main)/dashboard/page.tsx` — 게이미피케이션/메모 제거, 유튜브 위젯 추가
- `packages/web/src/components/layout/layout-shell.tsx` — PlayerProvider, MiniPlayer 제거
- `packages/web/src/components/layout/tab-bar.tsx` — 팟캐스트 탭 제거 (5→4탭)
- `packages/web/src/app/auth/callback/route.ts` — ALLOWED_PATHS에서 `/podcast` 제거
- `packages/web/src/app/manifest.ts` — description 업데이트
- `vercel.json` — `podcast-reminder` cron 제거
- `packages/shared/src/schema/index.ts` — podcast, user-daily-activity export 제거
- `packages/web/src/lib/constants.ts` — podcast 관련 주석 문구 제거
- `packages/web/public/sw.js` — AUDIO_CACHE 핸들러 제거 (dead code)
- `CLAUDE.md` — 팟캐스트/게이미피케이션 섹션 제거

### 삭제
- `packages/web/src/app/(main)/podcast/` (전체)
- `packages/web/src/app/api/podcast/` (전체)
- `packages/web/src/app/api/cron/podcast-reminder/`
- `packages/web/src/components/features/podcast/` (전체)
- `packages/web/src/components/features/dashboard/weather-widget.tsx`
- `packages/web/src/components/features/dashboard/daily-missions.tsx`
- `packages/web/src/components/features/dashboard/attendance-recorder.tsx`
- `packages/web/src/lib/actions/activity.ts`
- `packages/web/src/lib/weather.ts`
- `packages/web/src/lib/greetings.ts`
- `packages/shared/src/schema/podcast.ts`
- `packages/shared/src/schema/user-daily-activity.ts`

### DB
- Drizzle 마이그레이션 신규 파일 (`0012_*.sql`): `DROP TABLE podcast_episodes, user_daily_activity`

---

## Task 1 — 대시보드용 유튜브 요약 위젯 신규 생성

**Files:**
- Create: `packages/web/src/components/features/video/dashboard-video.tsx`

- [ ] **Step 1: 기존 대시보드 큐레이션 위젯 구조 확인**

```bash
cat packages/web/src/components/features/curation/dashboard-curation.tsx
```

목적: 위젯 레이아웃/에러 폴백 패턴 그대로 차용한다.

- [ ] **Step 2: DashboardVideo 컴포넌트 작성**

파일 생성: `packages/web/src/components/features/video/dashboard-video.tsx`

```tsx
import Link from 'next/link';
import {desc, eq, and} from 'drizzle-orm';
import {db, videoItems} from '@forme/shared';
import {getAuthUser} from '@/lib/auth';
import {PlayCircle} from 'lucide-react';

const LIMIT = 5;

export async function DashboardVideo() {
  try {
    const user = await getAuthUser();
    const items = await db
      .select({
        id: videoItems.id,
        title: videoItems.title,
        channelTitle: videoItems.channelTitle,
        thumbnailUrl: videoItems.thumbnailUrl,
        publishedAt: videoItems.publishedAt,
      })
      .from(videoItems)
      .where(
        and(
          eq(videoItems.userId, user.id),
          eq(videoItems.status, 'summarized')
        )
      )
      .orderBy(desc(videoItems.createdAt))
      .limit(LIMIT);

    if (items.length === 0) {
      return (
        <section aria-labelledby="dashboard-video-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="dashboard-video-heading" className="text-sm font-semibold">
              최근 유튜브 요약
            </h3>
            <Link href="/video" className="text-xs text-muted-foreground hover:text-foreground">
              전체 보기
            </Link>
          </div>
          <p className="text-sm text-muted-foreground rounded-xl border border-border/60 p-6 text-center">
            아직 요약된 영상이 없습니다.
          </p>
        </section>
      );
    }

    return (
      <section aria-labelledby="dashboard-video-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="dashboard-video-heading" className="text-sm font-semibold">
            최근 유튜브 요약
          </h3>
          <Link href="/video" className="text-xs text-muted-foreground hover:text-foreground">
            전체 보기
          </Link>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/video/${item.id}`}
                className="flex gap-3 rounded-xl border border-border/60 p-3 hover:bg-accent/40 transition-colors"
              >
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="h-14 w-24 rounded-md object-cover bg-muted"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-14 w-24 rounded-md bg-muted flex items-center justify-center">
                    <PlayCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  {item.channelTitle && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.channelTitle}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  } catch {
    return (
      <section aria-labelledby="dashboard-video-heading-error" className="space-y-3">
        <h3 id="dashboard-video-heading-error" className="text-sm font-semibold">
          최근 유튜브 요약
        </h3>
        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 p-4">
          목록을 불러오지 못했습니다.
        </p>
      </section>
    );
  }
}
```

- [ ] **Step 3: videoItems 스키마 필드명 검증**

```bash
cat packages/shared/src/schema/video-items.ts | head -60
```

확인 사항: `status`, `channelTitle`, `thumbnailUrl`, `publishedAt`, `createdAt`, `userId` 필드가 모두 존재하는지. 만약 필드명이 다르면 Step 2 코드를 실제 스키마에 맞게 수정.

- [ ] **Step 4: 타입체크**

```bash
pnpm typecheck
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add packages/web/src/components/features/video/dashboard-video.tsx
git commit -m "feat: 대시보드용 유튜브 최근 요약 위젯 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — 대시보드 페이지 재구성

**Files:**
- Modify: `packages/web/src/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: `dashboard/page.tsx`를 아래 내용으로 완전히 교체**

```tsx
import {Suspense} from 'react';
import {DashboardCuration} from '@/components/features/curation/dashboard-curation';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardVideo} from '@/components/features/video/dashboard-video';

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-28 bg-muted rounded-md" />
      <div className="rounded-xl border border-border/60 bg-muted/40 h-44" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-5">
      {/* Visually hidden h1 satisfies WCAG 1.3.1 landmark structure. */}
      <h1 className="sr-only">대시보드</h1>

      {/* Upcoming calendar events */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCalendar />
      </Suspense>

      {/* Latest curation items */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardCuration />
      </Suspense>

      {/* Latest YouTube summaries */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardVideo />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

```bash
pnpm typecheck && pnpm lint
```

Expected: 에러 없음. (아직 삭제되지 않은 weather/missions/attendance/greetings 파일들은 존재만 하고 아무 곳에서도 import되지 않으면 린트는 통과 — 파일 자체는 이후 태스크에서 삭제.)

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/app/(main)/dashboard/page.tsx
git commit -m "refactor: 대시보드를 정보성 위젯 3개로 축소

게이미피케이션(날씨/미션/출석/인사) 제거, 유튜브 요약 위젯 추가.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Layout Shell에서 Player/MiniPlayer 제거

**Files:**
- Modify: `packages/web/src/components/layout/layout-shell.tsx`

- [ ] **Step 1: 파일을 아래 내용으로 완전히 교체**

```tsx
'use client';

import {PullToRefresh} from '@/components/layout/pull-to-refresh';

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * LayoutShell — client boundary for the authenticated layout.
 * Owns PullToRefresh for Safari PWA support.
 */
export function LayoutShell({ children }: LayoutShellProps) {
  return <PullToRefresh>{children}</PullToRefresh>;
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm typecheck
```

Expected: 에러 없음. (팟캐스트 페이지/컴포넌트가 `usePlayer()`를 호출하지만 아직 컨텍스트 파일은 남아 있으므로 개별 파일 타입은 통과. 팟캐스트 페이지 자체가 다음 태스크에서 삭제되므로 잠시 가비지 상태는 OK.)

만약 타입 에러 발생 시, 팟캐스트 페이지에서 `usePlayer`를 import하는 지점이 에러 메시지에 나올 것이다. 그 경우 이 태스크를 Task 5(팟캐스트 삭제)와 합쳐서 한 커밋으로 처리해도 된다.

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/components/layout/layout-shell.tsx
git commit -m "refactor: layout-shell에서 PlayerProvider/MiniPlayer 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — 탭바, Auth Callback, Manifest, Vercel Cron 정리

**Files:**
- Modify: `packages/web/src/components/layout/tab-bar.tsx`
- Modify: `packages/web/src/app/auth/callback/route.ts`
- Modify: `packages/web/src/app/manifest.ts`
- Modify: `vercel.json`

- [ ] **Step 1: tab-bar.tsx — 팟캐스트 탭 제거**

`packages/web/src/components/layout/tab-bar.tsx` 파일의 import 줄과 tabs 배열을 다음과 같이 수정:

`import` 줄에서 `Headphones` 제거:
```tsx
import {Calendar, Newspaper, PlayCircle, StickyNote} from 'lucide-react';
```

`tabs` 배열을 다음으로 교체:
```tsx
const tabs = [
  { href: '/curation', label: '큐레이션', icon: Newspaper },
  { href: '/video', label: '유튜브', icon: PlayCircle },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/memo', label: '메모', icon: StickyNote },
];
```

- [ ] **Step 2: auth/callback/route.ts — ALLOWED_PATHS에서 `/podcast` 제거**

4번 줄을 다음으로 변경:
```tsx
const ALLOWED_PATHS = ['/dashboard', '/curation', '/video', '/calendar', '/memo'];
```

(`/video`도 함께 추가 — 현재 누락되어 있음)

- [ ] **Step 3: manifest.ts — description 수정**

7번 줄을 다음으로 변경:
```tsx
    description: '큐레이션, 캘린더, 메모, 유튜브 요약을 한곳에서',
```

- [ ] **Step 4: vercel.json — `podcast-reminder` cron 제거**

`crons` 배열에서 해당 객체 제거. 결과는 다음과 같아야 함:

```json
{
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/curation",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/calendar-daily",
      "schedule": "0 23 * * *"
    }
  ]
}
```

- [ ] **Step 5: 타입체크 + 린트 + 빌드**

```bash
pnpm typecheck && pnpm lint
```

Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/web/src/components/layout/tab-bar.tsx \
        packages/web/src/app/auth/callback/route.ts \
        packages/web/src/app/manifest.ts \
        vercel.json
git commit -m "chore: 팟캐스트 관련 네비게이션/설정 제거

- 탭바 5→4탭
- auth callback ALLOWED_PATHS 정리
- manifest description 업데이트
- vercel cron podcast-reminder 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — 팟캐스트 코드 디렉터리 일괄 삭제

**Files:**
- Delete: `packages/web/src/app/(main)/podcast/`
- Delete: `packages/web/src/app/api/podcast/`
- Delete: `packages/web/src/app/api/cron/podcast-reminder/`
- Delete: `packages/web/src/components/features/podcast/`

- [ ] **Step 1: 삭제 실행**

```bash
rm -rf packages/web/src/app/\(main\)/podcast \
       packages/web/src/app/api/podcast \
       packages/web/src/app/api/cron/podcast-reminder \
       packages/web/src/components/features/podcast
```

- [ ] **Step 2: 잔존 import 참조 확인**

```bash
rg -l 'components/features/podcast|player-context|MiniPlayer|PlayerProvider|usePlayer|audio-player|episode-card|episode-list|upload-dialog|edit-episode-dialog|delete-episode-dialog' packages/
```

Expected: 매치 없음. 매치가 있으면 해당 파일을 수정해서 import를 제거할 것. (예상되는 false positive: node_modules — `packages/` 스코프라 문제 없음.)

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: 에러 없음. 빌드 성공 (중요 — Next.js 라우트 맵에서 팟캐스트가 완전히 빠졌는지 확인).

- [ ] **Step 4: 커밋**

```bash
git add -A packages/web/src/app/\(main\)/podcast \
          packages/web/src/app/api/podcast \
          packages/web/src/app/api/cron/podcast-reminder \
          packages/web/src/components/features/podcast
git commit -m "feat: 팟캐스트 페이지/API/컴포넌트 전체 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(주의: `git add -A`는 금지. 여기서는 삭제된 경로만 명시적으로 스테이징하려는 의도이므로 아래 대안 사용:)

```bash
git add packages/web/src/app/\(main\)/podcast/ \
        packages/web/src/app/api/podcast/ \
        packages/web/src/app/api/cron/podcast-reminder/ \
        packages/web/src/components/features/podcast/
```

(`git add`는 삭제된 파일도 인식하므로 삭제된 디렉터리 경로를 인자로 주면 rm 결과가 스테이징된다.)

```bash
git commit -m "feat: 팟캐스트 페이지/API/컴포넌트 전체 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — 게이미피케이션 코드 삭제

**Files:**
- Delete: `packages/web/src/components/features/dashboard/weather-widget.tsx`
- Delete: `packages/web/src/components/features/dashboard/daily-missions.tsx`
- Delete: `packages/web/src/components/features/dashboard/attendance-recorder.tsx`
- Delete: `packages/web/src/lib/actions/activity.ts`
- Delete: `packages/web/src/lib/weather.ts`
- Delete: `packages/web/src/lib/greetings.ts`

- [ ] **Step 1: 삭제 실행**

```bash
rm packages/web/src/components/features/dashboard/weather-widget.tsx \
   packages/web/src/components/features/dashboard/daily-missions.tsx \
   packages/web/src/components/features/dashboard/attendance-recorder.tsx \
   packages/web/src/lib/actions/activity.ts \
   packages/web/src/lib/weather.ts \
   packages/web/src/lib/greetings.ts
```

- [ ] **Step 2: dashboard 디렉터리에 남은 파일 확인**

```bash
ls packages/web/src/components/features/dashboard/ 2>/dev/null
```

Expected: 빈 디렉터리거나 다른 파일 존재. 빈 디렉터리면 `rmdir`로 제거:
```bash
rmdir packages/web/src/components/features/dashboard/ 2>/dev/null || true
```

- [ ] **Step 3: 잔존 import 참조 확인**

```bash
rg -l 'features/dashboard|lib/actions/activity|lib/weather|lib/greetings|WeatherWidget|DailyMissions|AttendanceRecorder|getDailyMissionStats|getGreeting|getFormattedDate|recordAttendance' packages/
```

Expected: 매치 없음.

- [ ] **Step 4: 타입체크 + 린트 + 빌드**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add packages/web/src/components/features/dashboard/ \
        packages/web/src/lib/actions/activity.ts \
        packages/web/src/lib/weather.ts \
        packages/web/src/lib/greetings.ts
git commit -m "feat: 게이미피케이션 코드 제거 (날씨/미션/출석/인사)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Schema 정리 + DB 마이그레이션 생성

**Files:**
- Modify: `packages/shared/src/schema/index.ts`
- Delete: `packages/shared/src/schema/podcast.ts`
- Delete: `packages/shared/src/schema/user-daily-activity.ts`
- Create: `packages/shared/drizzle/0012_*.sql` (drizzle-kit이 생성)

- [ ] **Step 1: schema/index.ts에서 두 줄 제거**

`packages/shared/src/schema/index.ts`에서 아래 두 줄을 삭제:
```ts
export * from './podcast';
...
export * from './user-daily-activity';
```

변경 후 전체 파일:
```ts
export * from './profiles';
export * from './curation-sources';
export * from './curation-items';
export * from './event-categories';
export * from './calendar-events';
export * from './todos';
export * from './push-subscriptions';
export * from './memos';
export * from './bookmark-collections';
export * from './video-sources';
export * from './video-items';
export * from './video-bookmark-collections';
```

- [ ] **Step 2: 스키마 파일 삭제**

```bash
rm packages/shared/src/schema/podcast.ts \
   packages/shared/src/schema/user-daily-activity.ts
```

- [ ] **Step 3: 타입체크 (shared 패키지)**

```bash
pnpm --filter @forme/shared typecheck
```

Expected: 에러 없음. (web 패키지의 podcast/activity 참조는 이미 이전 태스크에서 제거됨.)

- [ ] **Step 4: Drizzle 마이그레이션 생성**

```bash
pnpm --filter @forme/shared db:generate
```

새 파일 `packages/shared/drizzle/0012_*.sql`이 생성되어야 한다. 내용을 확인:

```bash
ls packages/shared/drizzle/ | tail -3
cat packages/shared/drizzle/0012_*.sql
```

Expected: `DROP TABLE "podcast_episodes" CASCADE;` 및 `DROP TABLE "user_daily_activity" CASCADE;` (또는 유사) 포함. CASCADE가 빠져 있고 FK 의존성이 있으면 수동으로 CASCADE 추가.

- [ ] **Step 5: 전체 프로젝트 타입체크 + 빌드**

```bash
pnpm typecheck && pnpm build
```

Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/schema/index.ts \
        packages/shared/src/schema/podcast.ts \
        packages/shared/src/schema/user-daily-activity.ts \
        packages/shared/drizzle/
git commit -m "feat: podcast_episodes, user_daily_activity 테이블 drop

Drizzle 마이그레이션 0012 추가. schema export 정리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — 구성 파일 정리 (constants, sw.js)

**Files:**
- Modify: `packages/web/src/lib/constants.ts`
- Modify: `packages/web/public/sw.js`

- [ ] **Step 1: constants.ts — 워크트리 주석 업데이트**

파일 상단 주석에서 `podcast` 언급 제거. 2~6번 줄 주석 블록을 아래로 교체:

```ts
/**
 * Application-wide constants shared across features.
 *
 * Centralising constants here avoids magic numbers scattered across the
 * codebase and makes global tuning easy.
 */
```

- [ ] **Step 2: sw.js — AUDIO 캐시 관련 코드 제거**

`packages/web/public/sw.js`를 열고 다음 블록을 전부 제거:

1. `AUDIO_CACHE_NAME`, `MAX_AUDIO_CACHE_ITEMS` 상수 선언 (약 6, 12번 줄)
2. `keepCaches` 배열에서 `AUDIO_CACHE_NAME` 제거 (약 43번 줄)
3. 오디오 요청 핸들러 전체 블록 (약 66~80번 줄, `request.destination === 'audio'` 분기 전체)

Step 1 실행 전에 현재 내용 확인:
```bash
cat packages/web/public/sw.js | head -90
```

정확한 줄 번호 확인 후 `Edit` 도구로 세 블록을 각각 제거.

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add packages/web/src/lib/constants.ts packages/web/public/sw.js
git commit -m "chore: constants 주석 정리, sw.js 오디오 캐시 dead code 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 팟캐스트/게이미피케이션 관련 섹션/라인 제거**

다음 항목들을 CLAUDE.md에서 찾아 제거하거나 수정:

1. **기술 스택 테이블**: "스토리지 | Cloudflare R2 (팟캐스트 음성, 메모 이미지)" → "스토리지 | Cloudflare R2 (메모 이미지)"
2. **기술 스택 테이블**: "푸시알림 | web-push + Service Worker + Supabase pg_cron (리마인더)" 유지 (팟캐스트 리마인더 외 캘린더 리마인더도 있으므로)
3. **코딩 컨벤션** 내 "팟캐스트 플레이어" 불릿 라인 제거
4. **코딩 컨벤션** 내 "팟캐스트 반자동화" 불릿 라인 제거
5. **코딩 컨벤션** 내 "Discord 웹훅" 라인 중 팟캐스트 관련 내용 제거 (Discord 웹훅 자체는 유지)
6. **코딩 컨벤션** 내 "게이미피케이션" 불릿 라인 제거
7. **핵심 파일 테이블**: 팟캐스트 관련 행 전부 제거 (player-context, episode-card, podcast/upload, podcast-reminder cron 등)
8. **핵심 파일 테이블**: 게이미피케이션 관련 행 제거 (activity.ts, weather.ts, greetings.ts, weather-widget, daily-missions, attendance-recorder, user-daily-activity schema)
9. **핵심 파일 테이블**: layout-shell 설명 업데이트 → "PlayerProvider + MiniPlayer + PullToRefresh"에서 "PullToRefresh"만 남기기
10. **환경 변수** 섹션에서 팟캐스트 관련 문구 있으면 제거 (현재는 없을 것)
11. **참고 프로젝트** 테이블의 hazel-admin "푸시알림" 설명은 유지

먼저 파일 전체를 읽고 위 항목들을 찾아 제거:
```bash
cat CLAUDE.md | head -200
```

- [ ] **Step 2: 빌드로 최종 검증**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 모두 그린.

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md에서 팟캐스트/게이미피케이션 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — 최종 검증 + 잔존 참조 제로 확인

**Files:** (수정 발견 시 해당 파일)

- [ ] **Step 1: 포괄 grep으로 잔존 참조 검사**

```bash
rg -i 'podcast|팟캐스트|weather|daily[_-]?mission|attendance|getGreeting|activity\.ts' \
  packages/ \
  --glob '!node_modules' \
  --glob '!.next' \
  --glob '!drizzle' \
  --glob '!*.sql'
```

Expected: 매치 없음. 매치가 있으면 각 파일을 수정해서 제거/업데이트.

주의: `drizzle` 폴더의 마이그레이션 SQL은 히스토리 보존이므로 제외한다.

- [ ] **Step 2: 전체 테스트 스위트 실행**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 모두 그린.

- [ ] **Step 3: 개발 서버 기동 스모크 테스트**

```bash
pnpm dev &
sleep 5
curl -s http://localhost:3200/ | head -20
# 로그인 후 수동 확인:
# - 탭바 4개 (큐레이션/유튜브/캘린더/메모)
# - 대시보드: 다가오는 일정 / 최근 큐레이션 / 최근 유튜브 요약만 표시
# - /podcast URL 직접 진입 시 404
# - /api/cron/podcast-reminder 호출 시 404
kill %1
```

- [ ] **Step 4: (수정 발견 시) 커밋**

잔존 참조 수정한 경우:
```bash
git add <수정된 파일들>
git commit -m "fix: 잔존 팟캐스트/게이미피케이션 참조 정리

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — PR 생성 + 머지 + 후속 수동 정리

- [ ] **Step 1: dev로 푸시하고 PR 생성**

```bash
git push -u origin feature/remove-podcast-gamification
gh pr create --base dev --title "refactor: 팟캐스트 기능 + 게이미피케이션 완전 제거" --body "$(cat <<'EOF'
## Summary

- 팟캐스트 페이지/API/컴포넌트/cron 전체 제거
- 게이미피케이션 (날씨/데일리 미션/출석 스트릭/인사 문구) 제거
- 대시보드를 정보성 위젯 3개로 축소 (다가오는 일정/최근 큐레이션/최근 유튜브 요약)
- 탭바 5→4탭
- DB 테이블 drop: `podcast_episodes`, `user_daily_activity`
- sw.js 오디오 캐시 dead code 정리

관련 설계 문서: `docs/plans/26-04-20-podcast-removal-and-feed-rename.md`

## Test plan

- [ ] Vercel 프리뷰 빌드 성공
- [ ] 탭바 4탭 표시 (큐레이션/유튜브/캘린더/메모)
- [ ] 대시보드 3개 위젯 표시, 게이미피케이션 요소 없음
- [ ] `/podcast` 진입 시 404
- [ ] 캘린더 / 큐레이션 / 유튜브 / 메모 기존 기능 정상 동작
- [ ] 푸시 알림 구독 상태 영향 없음
- [ ] 머지 후 Supabase 마이그레이션 적용 (`pnpm db:migrate` 또는 Vercel 환경)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: 머지 대기 — 사용자가 리뷰/머지**

CI 통과 후 사용자가 dev로 머지.

- [ ] **Step 3: Supabase 마이그레이션 적용 확인**

머지 후 Vercel 배포가 자동으로 Drizzle 마이그레이션을 돌리지 않으므로 (현재 설정상) 수동 적용 필요:

```bash
# Supabase SQL Editor에서 실행하거나 아래 커맨드:
pnpm --filter @forme/shared db:migrate
```

또는 Supabase 대시보드에서 `DROP TABLE podcast_episodes CASCADE; DROP TABLE user_daily_activity CASCADE;` 직접 실행.

- [ ] **Step 4: R2 버킷 팟캐스트 오디오 수동 삭제**

Cloudflare 대시보드 → R2 → 해당 버킷 → `podcast/` prefix (혹은 실제 prefix 확인) 하위 객체 전체 삭제.

- [ ] **Step 5: Supabase pg_cron 팟캐스트 관련 job 확인 + 제거 (있을 경우)**

```sql
-- Supabase SQL Editor에서 실행
SELECT jobid, jobname, schedule FROM cron.job WHERE jobname LIKE '%podcast%';
-- 매치가 있으면:
SELECT cron.unschedule('<jobname>');
```

현재 `supabase/pg-cron-setup.sql`은 calendar-reminder용만 있으므로 보통은 매치 없음.

- [ ] **Step 6: Phase 2 브랜치 생성 안내**

사용자에게 다음 단계 안내:
> Phase 1 완료. 이제 `git checkout dev && git pull && git checkout -b feature/rename-curation-to-feed`로 Phase 2 시작 가능.

---

## 체크리스트 요약

- [ ] Task 1: DashboardVideo 위젯 신규 생성
- [ ] Task 2: 대시보드 페이지 재구성
- [ ] Task 3: Layout Shell에서 Player 제거
- [ ] Task 4: 탭바/Auth/Manifest/Vercel cron 정리
- [ ] Task 5: 팟캐스트 코드 디렉터리 삭제
- [ ] Task 6: 게이미피케이션 코드 삭제
- [ ] Task 7: Schema 정리 + DB 마이그레이션 생성
- [ ] Task 8: constants/sw.js 구성 파일 정리
- [ ] Task 9: CLAUDE.md 업데이트
- [ ] Task 10: 최종 검증 + grep
- [ ] Task 11: PR 생성 + 머지 + 수동 정리 (R2, pg_cron)

---

## 리스크 & 완화

1. **빌드 파괴 리스크**: 태스크 간 의존성으로 중간 커밋이 컴파일 안 될 수 있음. 대응 — Task 3/5 합치기 가능. 본 플랜은 topological order로 의존성 최소화.
2. **DB 마이그레이션 실수**: `DROP TABLE` CASCADE가 누락되면 FK로 실패. 대응 — Task 7 Step 4에서 생성된 SQL 수동 검토.
3. **R2 오디오 고아 파일**: 코드가 제거돼도 R2 객체는 남음. 대응 — Task 11 Step 4에서 수동 정리.
4. **롤백**: 머지 후 문제 발생 시 `git revert` + DB `CREATE TABLE` 복구 SQL 수동 작성 필요. 대응 — Phase 1 머지 전 Supabase 덤프 백업 권장.
