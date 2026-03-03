# 큐레이션 기능 구현 플랜

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** RSS 기반 개인 큐레이션 피드 — 소스 관리, 자동/수동 수집, 카테고리/상태 필터, 무한스크롤, 북마크.

**Architecture:** study-admin 큐레이션 구조를 개인용으로 단순화. Supabase RLS로 데이터 보호. API Route로 CRUD + SSE 크롤. feedsmith로 RSS 파싱. 모바일 퍼스트 카드 UI.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase (RLS), feedsmith, Tailwind CSS 4, shadcn/ui, Vercel Cron

**Design Doc:** `docs/plans/26-03-03-curation-design.md`

**Reference:** `/Users/hansangho/Desktop/study-admin/packages/web/src/app/(user)/curation/page.tsx`, `/Users/hansangho/Desktop/study-admin/packages/web/src/app/api/admin/curation/crawl/route.ts`

**Git 규칙:** dev에 직접 커밋 금지. 모든 작업은 로컬에서 진행하고, 완료 후 feature 브랜치에서 한번에 커밋.

---

## Task 1: Drizzle 스키마 + 타입 정의

**Files:**
- Create: `packages/shared/src/schema/curation-sources.ts`
- Create: `packages/shared/src/schema/curation-items.ts`
- Modify: `packages/shared/src/schema/index.ts`
- Modify: `packages/shared/src/types/index.ts`

**Step 1: curation-sources 스키마 생성**

`packages/shared/src/schema/curation-sources.ts`:
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const curationSources = pgTable('curation_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  url: text('url').notNull(),
  rssUrl: text('rss_url'),
  category: varchar('category', { length: 50 }).notNull().default('ai'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: curation-items 스키마 생성**

`packages/shared/src/schema/curation-items.ts`:
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { curationSources } from './curation-sources';

export const curationItems = pgTable('curation_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => curationSources.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  url: text('url').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  category: varchar('category', { length: 50 }).notNull(),
  tags: text('tags').array(),
  isRead: boolean('is_read').notNull().default(false),
  isBookmarked: boolean('is_bookmarked').notNull().default(false),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_items_source_url').on(table.sourceId, table.url),
]);
```

**Step 3: schema/index.ts에 export 추가**

```typescript
export * from './profiles';
export * from './curation-sources';
export * from './curation-items';
```

**Step 4: types/index.ts에 타입 추가**

```typescript
import type { curationSources } from '../schema/curation-sources';
import type { curationItems } from '../schema/curation-items';

export type CurationSource = InferSelectModel<typeof curationSources>;
export type NewCurationSource = InferInsertModel<typeof curationSources>;
export type CurationItem = InferSelectModel<typeof curationItems>;
export type NewCurationItem = InferInsertModel<typeof curationItems>;
```

**Step 5: typecheck 실행**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 2: DB 테이블 + RLS 생성

**Files:**
- Create: `packages/shared/scripts/create-curation-tables.sql` (참고용)

**Step 1: Drizzle push로 테이블 생성**

Run: `cd packages/shared && pnpm db:push --force`

**Step 2: Supabase SQL로 RLS + 인덱스 생성**

Supabase Dashboard → SQL Editor 또는 스크립트 실행:

```sql
-- RLS: curation_sources
ALTER TABLE curation_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sources_select" ON curation_sources;
DROP POLICY IF EXISTS "sources_insert" ON curation_sources;
DROP POLICY IF EXISTS "sources_update" ON curation_sources;
DROP POLICY IF EXISTS "sources_delete" ON curation_sources;
CREATE POLICY "sources_select" ON curation_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sources_insert" ON curation_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sources_update" ON curation_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sources_delete" ON curation_sources FOR DELETE USING (auth.uid() = user_id);

-- RLS: curation_items (source의 user_id 확인)
ALTER TABLE curation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_select" ON curation_items;
DROP POLICY IF EXISTS "items_update" ON curation_items;
DROP POLICY IF EXISTS "items_delete" ON curation_items;
CREATE POLICY "items_select" ON curation_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));
CREATE POLICY "items_update" ON curation_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));
CREATE POLICY "items_delete" ON curation_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));

-- 추가 인덱스
CREATE INDEX IF NOT EXISTS idx_items_published ON curation_items(published_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_category ON curation_items(category);
CREATE INDEX IF NOT EXISTS idx_items_bookmarked ON curation_items(is_bookmarked) WHERE is_bookmarked = true;
CREATE INDEX IF NOT EXISTS idx_items_source ON curation_items(source_id);
CREATE INDEX IF NOT EXISTS idx_sources_user ON curation_sources(user_id);
```

**Step 3: typecheck 재확인**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 3: feedsmith 의존성 + 유틸리티

**Files:**
- Modify: `packages/web/package.json` (feedsmith 추가)
- Create: `packages/web/src/lib/curation-utils.ts`

**Step 1: feedsmith 설치**

Run: `cd packages/web && pnpm add feedsmith`

**Step 2: 큐레이션 유틸리티 생성**

`packages/web/src/lib/curation-utils.ts`:
```typescript
/**
 * 큐레이션 UI 유틸리티
 * 참고: /Users/hansangho/Desktop/study-admin/packages/web/src/lib/curation-utils.ts
 */

const GRADIENTS = [
  'from-sky-100 to-sky-200 dark:from-sky-900/30 dark:to-sky-800/30',
  'from-violet-100 to-violet-200 dark:from-violet-900/30 dark:to-violet-800/30',
  'from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30',
  'from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30',
  'from-rose-100 to-rose-200 dark:from-rose-900/30 dark:to-rose-800/30',
  'from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30',
] as const;

export function getArticleGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

export function formatRelativeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 기본 카테고리 스타일 */
export const DEFAULT_CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  ai: {
    label: 'AI',
    bg: 'bg-violet-100 dark:bg-violet-500/20',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-200 dark:ring-violet-500/30',
  },
  uxui: {
    label: 'UXUI',
    bg: 'bg-sky-100 dark:bg-sky-500/20',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-200 dark:ring-sky-500/30',
  },
  economy: {
    label: '경제',
    bg: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
  },
};

/** 카테고리 키로 스타일 반환 (사용자 정의 카테고리는 기본 스타일) */
export function getCategoryStyle(category: string) {
  return DEFAULT_CATEGORY_STYLES[category] ?? {
    label: category,
    bg: 'bg-gray-100 dark:bg-gray-500/20',
    text: 'text-gray-700 dark:text-gray-300',
    ring: 'ring-gray-200 dark:ring-gray-500/30',
  };
}
```

**Step 3: typecheck 확인**

Run: `pnpm typecheck`
Expected: PASS

---

## Task 4: 소스 API 라우트 (CRUD)

**Files:**
- Create: `packages/web/src/app/api/curation/sources/route.ts`
- Create: `packages/web/src/app/api/curation/sources/[id]/route.ts`

**Step 1: 소스 목록 + 추가 API**

`packages/web/src/app/api/curation/sources/route.ts`:
- GET: 현재 유저의 소스 목록 반환 (Supabase RLS)
- POST: 새 소스 추가. rss_url 없으면 HTML에서 `<link rel="alternate" type="application/rss+xml">` 자동 감지.
- 참고: `/Users/hansangho/Desktop/study-admin/packages/web/src/app/api/admin/curation/route.ts`

핵심 로직:
```typescript
// RSS URL 자동 감지
async function detectRssUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FormeBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i);
    if (!match?.[2]) return null;
    // 상대 URL을 절대 URL로 변환
    return new URL(match[2], url).toString();
  } catch {
    return null;
  }
}
```

**Step 2: 소스 수정 + 삭제 API**

`packages/web/src/app/api/curation/sources/[id]/route.ts`:
- PATCH: name, category, is_active 업데이트
- DELETE: 소스 삭제 (items CASCADE)

**Step 3: dev 서버에서 수동 테스트**

Run: `pnpm dev`
- `curl http://localhost:3200/api/curation/sources` (인증 필요하므로 401 확인)

---

## Task 5: 피드 조회 + 아이템 업데이트 API

**Files:**
- Create: `packages/web/src/app/api/curation/route.ts`
- Create: `packages/web/src/app/api/curation/[id]/route.ts`

**Step 1: 피드 조회 API (커서 페이지네이션)**

`packages/web/src/app/api/curation/route.ts`:
- GET: category, status(unread/bookmarked), search, cursor, limit 파라미터
- 커서: `publishedAt|id` 형식 (composite keyset)
- 응답: `{ items, nextCursor, hasMore }`
- study-admin의 `/api/curation/route.ts` 참고하되 recommended 로직은 제외

핵심 로직:
```typescript
// 커서 파싱
function parseCursor(cursor: string): { publishedAt: string; id: string } | null {
  const parts = cursor.split('|');
  if (parts.length !== 2) return null;
  return { publishedAt: parts[0]!, id: parts[1]! };
}

// 상태 필터
if (status === 'unread') {
  conditions.push(eq(curationItems.isRead, false));
} else if (status === 'bookmarked') {
  conditions.push(eq(curationItems.isBookmarked, true));
}
```

**Step 2: 아이템 업데이트 API (읽음/북마크)**

`packages/web/src/app/api/curation/[id]/route.ts`:
- PATCH: `{ is_read?, is_bookmarked? }` 업데이트

---

## Task 6: 크롤 API (SSE 스트리밍)

**Files:**
- Create: `packages/web/src/app/api/curation/crawl/route.ts`

**Step 1: SSE 크롤 API**

study-admin의 `/api/admin/curation/crawl/route.ts`를 포팅:
- admin 인증 → Supabase auth + RLS로 변경
- feedsmith 파싱 + extractFeedItems + sanitizeDescription + extractOgImage 동일
- SSE 이벤트: start → processing → progress → complete
- 참고: `/Users/hansangho/Desktop/study-admin/packages/web/src/app/api/admin/curation/crawl/route.ts`

주의: `import { parseFeed } from 'feedsmith'` 사용

---

## Task 7: Vercel Cron 자동 수집

**Files:**
- Create: `packages/web/src/app/api/cron/curation/route.ts`
- Create: `vercel.json` (프로젝트 루트)

**Step 1: Cron API 생성**

```typescript
// Authorization: Bearer CRON_SECRET 헤더 검증
// 현재 유저의 활성 소스 전체 크롤 (크롤 API 로직 재사용)
```

주의: Cron은 특정 유저가 아님 → service role key 사용하여 모든 활성 소스 수집.
또는: 개인용이므로 단일 유저 → CRON_USER_ID 환경변수로 지정.

**Step 2: vercel.json 생성**

```json
{
  "crons": [
    {
      "path": "/api/cron/curation",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## Task 8: 큐레이션 카드 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/curation/curation-card.tsx`

**Step 1: CurationCard 컴포넌트**

study-admin의 CurationCard 참고:
- 16:9 썸네일 (없으면 gradient 폴백)
- 제목 (2줄 clamp)
- 출처 + 상대시간
- 카테고리 뱃지
- 북마크 아이콘 (★)
- 읽음 상태 표시 (opacity 감소)
- 외부 링크 아이콘
- 탭 → 새 탭 열기 + is_read=true API 호출

---

## Task 9: 필터 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/curation/curation-filters.tsx`
- Create: `packages/web/src/components/features/curation/curation-search.tsx`

**Step 1: 카테고리 + 상태 필터**

`curation-filters.tsx`:
- 카테고리 필터: 가로 스크롤 pill 버튼 (전체 + 사용자 카테고리 + [+] 추가 버튼)
- 상태 필터: 3개 칩 (모든 글 / 안읽은 글 / ★ 북마크)
- URL searchParams 동기화 (useSearchParams)

**Step 2: 검색바**

`curation-search.tsx`:
- 300ms 디바운스 input
- 검색 아이콘 + 클리어 버튼
- URL searchParams 동기화

---

## Task 10: 소스 관리 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/curation/source-manager.tsx`
- Create: `packages/web/src/components/features/curation/source-form.tsx`
- Create: `packages/web/src/components/features/curation/crawl-progress.tsx`

**Step 1: 소스 관리 Dialog**

`source-manager.tsx`:
- shadcn/ui Dialog (모바일에서 풀스크린처럼 보이도록)
- 소스 목록 (이름, 카테고리, 활성 상태 토글)
- 소스 삭제 (스와이프 또는 삭제 버튼)
- "소스 추가" 버튼 → SourceForm
- "지금 수집" 버튼 → CrawlProgress

**Step 2: 소스 추가/수정 폼**

`source-form.tsx`:
- name, url, category(select), rss_url(선택) 입력
- 카테고리 select에 기존 카테고리 + "새 카테고리 추가" 옵션
- URL 입력 시 RSS 자동 감지 표시

**Step 3: 수집 진행률**

`crawl-progress.tsx`:
- SSE EventSource 연결
- 소스별 진행 상황 표시 (처리 중/완료/실패)
- 최종 요약 (새 아이템 수, 성공/실패 수)

---

## Task 11: 피드 메인 컴포넌트 + 페이지 조립

**Files:**
- Create: `packages/web/src/components/features/curation/curation-feed.tsx`
- Modify: `packages/web/src/app/(main)/curation/page.tsx`

**Step 1: CurationFeed 메인 컴포넌트**

`curation-feed.tsx`:
- 필터 상태 관리 (category, status, search)
- `/api/curation` fetch + 무한스크롤 (IntersectionObserver)
- 낙관적 업데이트 (북마크/읽음 토글)
- 빈 상태 처리 (소스 없음 / 결과 없음)
- 스켈레톤 로더

**Step 2: 페이지 조립**

`page.tsx`:
```typescript
import { CurationFeed } from '@/components/features/curation/curation-feed';

export default function CurationPage() {
  return <CurationFeed />;
}
```

---

## Task 12: 대시보드 큐레이션 섹션

**Files:**
- Modify: `packages/web/src/app/(main)/dashboard/page.tsx`

**Step 1: 대시보드에 최신 큐레이션 3건 표시**

- Server Component에서 `/api/curation?limit=3` fetch (또는 직접 Supabase 쿼리)
- 미니 카드 형태 (썸네일 + 제목 + 출처)
- "더보기" → /curation 링크

---

## Task 13: 빌드 검증 + pnpm install

**Step 1: pnpm install (feedsmith 추가됨)**

Run: `pnpm install`

**Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: build**

Run: `pnpm build`
Expected: PASS

---

## Task 14: feature 브랜치 생성 + 커밋

**Step 1: feature 브랜치 생성**

```bash
git checkout -b feature/curation
```

**Step 2: 변경 파일 전체 커밋**

```bash
git add packages/shared/src/schema/curation-sources.ts packages/shared/src/schema/curation-items.ts
git add packages/shared/src/schema/index.ts packages/shared/src/types/index.ts
git add packages/web/src/lib/curation-utils.ts
git add packages/web/src/app/api/curation/ packages/web/src/app/api/cron/
git add packages/web/src/components/features/curation/
git add packages/web/src/app/\(main\)/curation/page.tsx
git add packages/web/src/app/\(main\)/dashboard/page.tsx
git add packages/web/package.json pnpm-lock.yaml
git add vercel.json
git commit -m "feat: 큐레이션 기능 구현 (RSS 피드, 소스 관리, 북마크)"
```

---

## Verification

1. `pnpm build` 성공
2. `pnpm lint` 에러 없음
3. `pnpm typecheck` 에러 없음
4. `pnpm dev` → `/curation` 접속 → 빈 상태 UI 확인
5. 소스 관리 → 소스 추가 (GeekNews 등) → RSS 자동 감지 확인
6. "지금 수집" → SSE 진행률 표시 → 아이템 수집 확인
7. 피드에 수집된 아이템 표시 확인
8. 카테고리 필터 전환 확인
9. 안읽은 글 / 북마크 필터 확인
10. 카드 탭 → 외부 링크 열림 + 읽음 처리 확인
11. 북마크 아이콘 토글 확인
12. 무한스크롤 (12건 이상일 때) 확인
13. 검색 (디바운스) 확인
14. 대시보드에 최신 3건 표시 확인
