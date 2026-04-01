# Curation Soft Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 큐레이션 아이템 삭제를 soft delete로 전환하여, 삭제한 글이 다음 크롤에서 재수집되지 않도록 한다.

**Architecture:** `curation_items` 테이블에 `deletedAt` 컬럼 추가. 모든 DELETE → UPDATE set deletedAt, 모든 SELECT에 `deletedAt IS NULL` 필터 추가. 기존 `(sourceId, url)` unique constraint + title dedup이 자연스럽게 삭제된 아이템도 감지.

**Tech Stack:** Drizzle ORM, PostgreSQL, Next.js API Routes, Server Actions

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/schema/curation-items.ts` | `deletedAt` 컬럼 + 인덱스 추가 |
| Modify | `packages/web/src/app/api/curation/[id]/route.ts` | DELETE → soft delete, PATCH에 deletedAt IS NULL 필터 |
| Modify | `packages/web/src/app/api/curation/bulk-delete/route.ts` | hard delete → soft delete |
| Modify | `packages/web/src/app/api/curation/bulk-action/route.ts` | action='delete' → soft delete |
| Modify | `packages/web/src/app/api/curation/route.ts` | 피드 조회에 deletedAt IS NULL 필터 + 추천 서브쿼리 |
| Modify | `packages/web/src/app/api/curation/add-url/route.ts` | 중복 체크에 deletedAt IS NULL (삭제된 URL 재등록 허용) |
| Modify | `packages/web/src/lib/actions/activity.ts` | 큐레이션 읽은 수/스트릭 쿼리에 필터 |
| Modify | `packages/web/src/lib/actions/collections.ts` | 컬렉션 카운트 + 소유권 검증에 필터 |
| Modify | `packages/web/src/components/features/curation/dashboard-curation.tsx` | 대시보드 위젯 쿼리에 필터 |
| Modify | `packages/web/src/app/api/cron/curation/route.ts` | Discord URL 목록 쿼리에 필터 |
| Modify | `packages/web/src/lib/crawl-feed.ts` | title dedup 쿼리에 deletedAt IS NULL (삭제한 글 제목은 dedup에서 제외) |

---

### Task 1: Schema — `deletedAt` 컬럼 추가

**Files:**
- Modify: `packages/shared/src/schema/curation-items.ts`

- [ ] **Step 1: `deletedAt` 컬럼 + 인덱스 추가**

```typescript
// line 19 뒤에 추가 (memo 다음)
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

인덱스 (indexes 객체 안):
```typescript
deletedAtIdx: index('idx_items_deleted_at').on(table.deletedAt),
```

- [ ] **Step 2: Drizzle 마이그레이션 생성 + push**

```bash
cd /Users/hansangho/Desktop/forme
pnpm db:generate
pnpm db:push
```

---

### Task 2: DELETE API 3곳 → Soft Delete 전환

**Files:**
- Modify: `packages/web/src/app/api/curation/[id]/route.ts:44-63`
- Modify: `packages/web/src/app/api/curation/bulk-delete/route.ts:58-78`
- Modify: `packages/web/src/app/api/curation/bulk-action/route.ts:41-57`

- [ ] **Step 1: 단건 DELETE → soft delete (`[id]/route.ts`)**

line 44의 ownership 조회에 `isNull(curationItems.deletedAt)` 추가:
```typescript
// import 추가: isNull from 'drizzle-orm'
const [existing] = await db
  .select({ id: curationItems.id })
  .from(curationItems)
  .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
  .where(
    and(
      eq(curationItems.id, id),
      eq(curationSources.userId, user.id),
      isNull(curationItems.deletedAt)
    )
  )
  .limit(1);
```

line 63 hard delete → soft delete:
```typescript
await db.update(curationItems)
  .set({ deletedAt: new Date() })
  .where(eq(curationItems.id, id));
```

PATCH의 ownership 조회 (line 156)에도 동일 필터:
```typescript
.where(
  and(
    eq(curationItems.id, id),
    eq(curationSources.userId, user.id),
    isNull(curationItems.deletedAt)
  )
)
```

- [ ] **Step 2: bulk-delete → soft delete (`bulk-delete/route.ts`)**

line 58 ownership 조회에 필터 추가:
```typescript
// import 추가: isNull from 'drizzle-orm'
const ownedItems = await db
  .select({ id: curationItems.id })
  .from(curationItems)
  .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
  .where(
    and(
      inArray(curationItems.id, ids),
      eq(curationSources.userId, user.id),
      isNull(curationItems.deletedAt)
    )
  );
```

line 78 hard delete → soft delete:
```typescript
await db.update(curationItems)
  .set({ deletedAt: new Date() })
  .where(inArray(curationItems.id, ownedIds));
```

응답 키: `deleted` → 그대로 유지 (클라이언트 호환).

- [ ] **Step 3: bulk-action action='delete' → soft delete (`bulk-action/route.ts`)**

line 41 ownership 조회에 필터 추가:
```typescript
// import 추가: isNull from 'drizzle-orm'
const ownedItems = await db
  .select({id: curationItems.id})
  .from(curationItems)
  .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
  .where(and(inArray(curationItems.id, ids), eq(curationSources.userId, user.id), isNull(curationItems.deletedAt)));
```

line 56-57 delete → soft delete:
```typescript
} else if (action === 'delete') {
  await db.update(curationItems)
    .set({ deletedAt: new Date() })
    .where(condition);
}
```

- [ ] **Step 4: 로컬에서 삭제 동작 확인**

개발 서버에서 큐레이션 아이템 삭제 → DB에서 `deleted_at`이 설정되고 row가 남아있는지 확인.

---

### Task 3: SELECT 쿼리 — 피드 API + 추천 서브쿼리

**Files:**
- Modify: `packages/web/src/app/api/curation/route.ts:5,147,208-230`

- [ ] **Step 1: import에 `isNull` 추가**

```typescript
import {and, desc, eq, inArray, isNull, sql, type SQL} from 'drizzle-orm';
```

- [ ] **Step 2: filterConditions에 deletedAt IS NULL 추가 (line 147)**

```typescript
const filterConditions = [
  eq(curationSources.userId, user.id),
  isNull(curationItems.deletedAt),
];
```

- [ ] **Step 3: 추천 서브쿼리 2곳에 deleted_at IS NULL 추가**

readTagScoreExpr (line 208-218):
```typescript
const readTagScoreExpr = sql`COALESCE((
  SELECT SUM(LEAST(rtf.freq, 5))::int
  FROM (
    SELECT unnest(ri.tags) AS tag, COUNT(*)::int AS freq
    FROM curation_items ri
    JOIN curation_sources rs ON ri.source_id = rs.id
    WHERE rs.user_id = ${user.id} AND ri.is_read = true AND ri.deleted_at IS NULL
    GROUP BY 1
  ) rtf
  WHERE rtf.tag = ANY(${curationItems.tags})
), 0)`;
```

readCatScoreExpr (line 220-230):
```typescript
const readCatScoreExpr = sql`COALESCE((
  SELECT LEAST(rcf.freq, 10)
  FROM (
    SELECT ri.category, COUNT(*)::int AS freq
    FROM curation_items ri
    JOIN curation_sources rs ON ri.source_id = rs.id
    WHERE rs.user_id = ${user.id} AND ri.is_read = true AND ri.deleted_at IS NULL
    GROUP BY 1
  ) rcf
  WHERE rcf.category = ${curationItems.category}
), 0)`;
```

---

### Task 4: SELECT 쿼리 — 나머지 조회 6곳

**Files:**
- Modify: `packages/web/src/app/api/curation/add-url/route.ts:215-219`
- Modify: `packages/web/src/lib/actions/activity.ts:83-115`
- Modify: `packages/web/src/lib/actions/collections.ts:30-42,169-175`
- Modify: `packages/web/src/components/features/curation/dashboard-curation.tsx:58-63`
- Modify: `packages/web/src/app/api/cron/curation/route.ts:94-98`
- Modify: `packages/web/src/lib/crawl-feed.ts:218-229`

- [ ] **Step 1: add-url 중복 체크 — 삭제된 URL 재등록 허용 (add-url/route.ts:215-219)**

```typescript
// import에 isNull 추가
const [existing] = await db
  .select({id: curationItems.id})
  .from(curationItems)
  .where(and(
    eq(curationItems.sourceId, sourceId),
    eq(curationItems.url, url),
    isNull(curationItems.deletedAt)
  ))
  .limit(1);
```

이렇게 하면 삭제한 URL은 다시 수동 등록 가능. DB unique constraint `(sourceId, url)`은 그대로이므로, 동일 소스+URL이 soft-deleted 상태에서 새로 insert하면 conflict 발생 → `onConflictDoUpdate`로 deletedAt을 null로 리셋하는 방식으로 처리:

```typescript
const [inserted] = await db
  .insert(curationItems)
  .values({ sourceId, title, url, description, thumbnailUrl, category, tags, isRead: false })
  .onConflictDoUpdate({
    target: [curationItems.sourceId, curationItems.url],
    set: {
      title,
      description,
      thumbnailUrl,
      category,
      tags,
      deletedAt: null,
      isRead: false,
      isBookmarked: false,
      memo: null,
      collectionId: null,
      collectedAt: new Date(),
    },
    setWhere: sql`${curationItems.deletedAt} IS NOT NULL`,
  })
  .returning();
```

**주의:** `setWhere`를 사용하여 살아있는 아이템은 업데이트하지 않음 (기존 409 에러로 처리됨).

- [ ] **Step 2: activity.ts — 큐레이션 읽은 수 쿼리 (line 83-95)**

import에 `isNull` 추가 후:
```typescript
// 오늘 큐레이션 읽은 수 (curationReadRows)
.where(
  and(
    eq(curationSources.userId, user.id),
    eq(curationItems.isRead, true),
    isNull(curationItems.deletedAt),
    sql`DATE(${curationItems.readAt} AT TIME ZONE 'Asia/Seoul') = ${today}`,
  )
)
```

- [ ] **Step 3: activity.ts — 큐레이션 스트릭 쿼리 (line 96-116)**

```typescript
// 큐레이션 스트릭 (curationDailyReads)
.where(
  and(
    eq(curationSources.userId, user.id),
    eq(curationItems.isRead, true),
    isNull(curationItems.deletedAt),
    sql`${curationItems.readAt} IS NOT NULL`,
  )
)
```

- [ ] **Step 4: collections.ts — 컬렉션 카운트 (line 30-42)**

import에 `isNull` 추가 후:
```typescript
.where(and(
  sql`${curationItems.collectionId} IS NOT NULL`,
  eq(curationSources.userId, user.id),
  isNull(curationItems.deletedAt)
))
```

- [ ] **Step 5: collections.ts — 소유권 검증 (line 169-175)**

```typescript
const [existing] = await traceQuery('verify_ownership', () =>
  db.select({ id: curationItems.id })
    .from(curationItems)
    .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
    .where(and(
      eq(curationItems.id, itemId),
      eq(curationSources.userId, user.id),
      isNull(curationItems.deletedAt)
    ))
    .limit(1)
);
```

- [ ] **Step 6: dashboard-curation.tsx — 대시보드 위젯 (line 58-63)**

import에 `isNull` 추가 (`drizzle-orm`):
```typescript
import {and, desc, eq, isNull, sql} from 'drizzle-orm';
```

```typescript
.where(
  and(
    eq(curationSources.userId, user.id),
    eq(curationItems.isRead, false),
    isNull(curationItems.deletedAt),
  )
)
```

- [ ] **Step 7: cron/curation/route.ts — Discord URL 목록 (line 94-98)**

import에 `isNull` 추가:
```typescript
import {and, desc, eq, gte, isNull} from 'drizzle-orm';
```

```typescript
.where(
  and(
    eq(curationSources.userId, userId),
    gte(curationItems.collectedAt, since),
    isNull(curationItems.deletedAt),
  ),
)
```

- [ ] **Step 8: crawl-feed.ts — title dedup에서 삭제된 아이템 제외 (line 218-229)**

삭제한 글의 제목은 dedup에서 제외해야 다음 크롤에서 다시 수집 가능:

```typescript
// import에 isNull 추가
import {and, eq, inArray, isNull} from 'drizzle-orm';

// line 220-228
const rows = await db
  .select({ title: curationItems.title })
  .from(curationItems)
  .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
  .where(and(
    eq(curationSources.userId, source.userId),
    inArray(curationItems.title, chunk),
    isNull(curationItems.deletedAt)
  ));
```

**잠깐!** 여기서는 반대로 생각해야 함. 삭제한 글은 재수집 방지가 목적이니까 `deletedAt IS NULL`이 아니라 **삭제된 것도 포함**해서 dedup해야 함. 따라서 **crawl-feed.ts title dedup은 수정하지 않는다.**

마찬가지로 `INSERT ... onConflictDoNothing()` (line 287-290)도 수정 불필요 — soft-deleted row가 DB에 남아있으므로 `(sourceId, url)` unique constraint이 자동으로 재수집을 막아준다.

---

### Task 5: 검증 + 타입체크

- [ ] **Step 1: TypeScript 타입 체크**

```bash
cd /Users/hansangho/Desktop/forme && pnpm typecheck
```

- [ ] **Step 2: ESLint**

```bash
pnpm lint
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build
```

- [ ] **Step 4: E2E 시나리오 수동 검증**

1. 큐레이션 아이템 삭제 → 피드에서 사라지는지 확인
2. 크롤 실행 → 삭제한 아이템이 다시 수집되지 않는지 확인
3. 삭제한 URL을 "직접 추가"로 재등록 → 409가 아니라 정상 등록되는지 확인
4. 대시보드 위젯에 삭제된 아이템이 표시되지 않는지 확인
5. 컬렉션 카운트에 삭제된 아이템이 포함되지 않는지 확인
