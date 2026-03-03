# 코드 패턴

## Supabase 클라이언트

### 서버 (Server Components / Server Actions / Route Handlers)

```typescript
// packages/web/src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 브라우저 (Client Components)

```typescript
// packages/web/src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Proxy (Next.js 16 세션 갱신)

```typescript
// packages/web/src/lib/supabase/middleware.ts — updateSession()이 { user, supabaseResponse } 반환
// packages/web/src/proxy.ts — Next.js 16 proxy 패턴 (middleware.ts 대체)
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { user, supabaseResponse } = await updateSession(request)
  // 인증 불필요 경로: /login, /auth/callback
  // 미인증 → /login 리다이렉트, 인증+/login → /dashboard 리다이렉트
  return supabaseResponse
}
```

## 인증 패턴

### OAuth 콜백 (open redirect 방어)

```typescript
// packages/web/src/app/auth/callback/route.ts
const ALLOWED_PATHS = ['/dashboard', '/curation', '/calendar', '/memo', '/podcast']

export async function GET(request: Request) {
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // 상대경로 + 허용 목록 검증 → open redirect 차단
  const next = ALLOWED_PATHS.some((p) => safePath.startsWith(p)) ? safePath : '/dashboard'
  const supabase = await createClient()
  await supabase.auth.exchangeCodeForSession(code)
  return NextResponse.redirect(`${origin}${next}`)
}
```

### 인증 가드 (Server Action / API Route)

```typescript
import { createClient } from '@/lib/supabase/server'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user
}
```

## Server Action 패턴

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTodo(formData: { date: string; content: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase.from('todos').insert({
    user_id: user.id,
    ...formData,
  })
  if (error) throw error

  revalidatePath('/calendar')
}
```

## API Route 패턴 (Drizzle + 커서 페이지네이션)

```typescript
// packages/web/src/app/api/curation/route.ts
import { db, curationItems, curationSources } from '@forme/shared'
import { eq, and, desc, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Supabase Auth로 인증 → Drizzle ORM으로 직접 쿼리
  const sortDateExpr = sql`COALESCE(${curationItems.publishedAt}, ${curationItems.collectedAt})`

  const rows = await db
    .select({ /* ... */ sortDate: sortDateExpr.as('sort_date') })
    .from(curationItems)
    .innerJoin(curationSources, eq(curationItems.sourceId, curationSources.id))
    .where(and(...filterConditions))
    .orderBy(sql`${sortDateExpr} DESC`, desc(curationItems.id))
    .limit(limit + 1)

  // keyset cursor: "<sortDate ISO>|<uuid>"
  const nextCursor = hasMore
    ? `${new Date(lastItem.sortDate as string | Date).toISOString()}|${lastItem.id}`
    : null
  return NextResponse.json({ items, nextCursor, hasMore })
}
```

## RSS 크롤 패턴

```typescript
// packages/web/src/lib/crawl-feed.ts
import { parseFeed } from 'feedsmith'

// since 옵션으로 수집 기간 제한 (publishedAt 기준 필터링)
export async function crawlSource(source: CrawlSource, options?: { since?: Date })
  : Promise<CrawlSourceResult> {
  // 1. SSRF 방어 (isSafeUrl)
  // 2. fetch → parseFeed → extractFeedItems (RSS/Atom/JSON/RDF 통합)
  // 3. since 필터: publishedAt < since 제외, 날짜 없으면 통과
  // 4. OG image 병렬 추출 (5개씩 배치)
  // 5. 피드 태그 + 소스 태그 머지
  // 6. db.insert().onConflictDoNothing() — (source_id, url) unique constraint
  return { sourceId, sourceName, success, itemsFound, newItemsAdded, itemsFilteredOut }
}

// SSE 스트림: POST /api/curation/crawl (since: ISO string body)
// Cron: GET /api/cron/curation (기본 7일 필터)
```

## Drizzle ORM 패턴

```typescript
// packages/shared/src/schema/todos.ts
import { pgTable, uuid, text, date, boolean, integer, timestamp } from 'drizzle-orm/pg-core'

export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  content: text('content').notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  reminderAt: timestamp('reminder_at', { withTimezone: true }),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

## 컴포넌트 Import 패턴

```typescript
// shadcn/ui
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// 레이아웃
import { TabBar } from '@/components/layout/tab-bar'

// 기능별
import { CurationCard } from '@/components/features/curation/curation-card'
```
