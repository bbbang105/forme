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

## API Route 패턴 (커서 페이지네이션)

```typescript
// packages/web/src/app/api/curation/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  const cursor = searchParams.get('cursor')
  const category = searchParams.get('category')
  const limit = 20

  let query = supabase
    .from('curation_items')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit + 1)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }
  if (cursor) {
    query = query.lt('published_at', cursor)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hasMore = data.length > limit
  const items = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? items[items.length - 1].published_at : null

  return NextResponse.json({ items, nextCursor })
}
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
