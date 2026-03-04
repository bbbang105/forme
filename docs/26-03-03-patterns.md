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

## 배치 업데이트 패턴 (트랜잭션)

```typescript
// packages/web/src/app/api/curation/sources/reorder/route.ts
// Body: { items: [{ id: string, favoriteOrder: number }] }
// 검증: UUID 포맷, 중복 ID 차단, 정수 범위 (0~10000), 배열 최대 50
const items = body.items;

await db.transaction(async (tx) => {
  for (const item of items) {
    await tx
      .update(curationSources)
      .set({ favoriteOrder: item.favoriteOrder })
      .where(
        and(
          eq(curationSources.id, item.id),
          eq(curationSources.userId, user.id)  // 소유권 보장
        )
      );
  }
});
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

## R2 파일 업로드 패턴

```typescript
// packages/web/src/lib/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export async function uploadToR2(key: string, body: Buffer, contentType: string)
  : Promise<{ url: string }> {
  // S3Client → Cloudflare R2 (S3-compatible)
  // key: "podcast/{userId}/{uuid}.{ext}" 또는 "memo-images/{userId}/{uuid}.{ext}"
  // MIME 기반 확장자만 허용 (파일명 무시)
  return { url: `${R2_PUBLIC_URL}/${key}` }
}

// Route: POST /api/podcast/upload (FormData, 오디오, 200MB)
// Route: POST /api/memo/image (FormData, 이미지, 5MB, JPEG/PNG/GIF/WebP)
// MIME 검증 → 사이즈 검증 → R2 업로드 → URL 반환
```

## 푸시 알림 패턴

```typescript
// packages/web/src/lib/push.ts
import webpush from 'web-push'

// VAPID lazy init, 유저별 활성 구독에 발송
export async function sendPushToUser(userId: string, payload: NotificationPayload)
  : Promise<{ sent: number; failed: number }> {
  // 1. pushSubscriptions에서 userId + isActive 조회
  // 2. Promise.allSettled로 멀티 디바이스 발송
  // 3. 404/410 영구 실패 구독 자동 비활성화
  // URL은 반드시 상대경로 ('/'로 시작)
}

// API: POST/DELETE/GET /api/push/subscribe
// 보안: HTTPS endpoint 강제, 소유자 확인, 필드 길이 제한
// Cron 연동: /api/cron/curation에서 새 글 발견 시 자동 발송
```

## Server Action 입력 검증 패턴

```typescript
// packages/web/src/lib/actions/calendar.ts
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export async function createCalendarEvent(data: { title: string; startDate: string; ... }) {
  const user = await requireAuth();

  // 입력 검증
  if (!data.title.trim()) throw new Error('제목을 입력해주세요');
  if (data.title.trim().length > 200) throw new Error('제목은 200자 이내여야 합니다');
  if (!DATE_REGEX.test(data.startDate)) throw new Error('Invalid date format');
  if (data.color && !HEX_COLOR_REGEX.test(data.color)) throw new Error('Invalid color');
  if (data.startDate > data.endDate) throw new Error('종료일은 시작일 이후여야 합니다');

  // Drizzle ORM 사용
  const [row] = await db.insert(calendarEvents).values({ ... }).returning();
  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return row;
}
```

## 캘린더 클라이언트 패턴

```typescript
// 모바일 터치 스와이프: useSwipe 훅 사용 (packages/web/src/hooks/use-swipe.ts)
// 키보드 내비게이션: 화살표(←→↑↓) 날짜 이동, T 오늘
// 월 전환 애니메이션: CSS animate-slide-left/right
// 투두 진행률: 완료/전체 프로그레스 바
// 이벤트 삭제: AlertDialog 확인 다이얼로그
```

## 메모 에디터 패턴 (TipTap)

```typescript
// packages/web/src/lib/actions/memos.ts
// JSONB content 저장 시 서버사이드 검증
function sanitizeTipTapContent(content: Record<string, unknown>) {
  if (content.type !== 'doc') throw new Error('Invalid content format');
  if (JSON.stringify(content).length > 500000) throw new Error('메모 내용이 너무 큽니다');
  // 재귀적으로 link marks의 href 프로토콜 검증 (http/https/mailto만 허용)
  return sanitizeNode(content);
}

// UUID 검증 + contentText 길이 제한 + LIKE 메타문자 이스케이프
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function escapeLikePattern(input: string) {
  return input.replace(/[%_\\]/g, '\\$&');
}

// 태그 검증: 최대 5개, 각 20자 이내, 공백 트리밍
function validateTags(tags: string[]): string[] {
  if (tags.length > 5) throw new Error('태그는 최대 5개');
  return tags.map(t => t.trim()).filter(Boolean);
}

// 자동저장: 클라이언트에서 1초 debounce + blur 시 즉시 저장
// 저장 실패: 에러 UI + 재시도 버튼 (saveError 상태)
// IME 처리: compositionstart/end 이벤트로 한글 입력 중 저장 방지
// 빈 메모: getMemos()에서 title/contentText 모두 빈 레코드 필터링
// 에디터 뒤로가기 시 빈 메모 자동 삭제
// 체크리스트: TaskListSort 플러그인으로 체크된 항목 자동 하단 정렬 (stable sort)
// 이미지: POST /api/memo/image (R2 업로드, 5MB, JPEG/PNG/GIF/WebP)
// 페이지네이션: getMemosPage(offset, limit) — offset 기반, "더 보기" UI
// 검색: searchMemos() 서버 액션 + 300ms debounce + 하이라이트
```

## 메모 이미지 블록 패턴 (커스텀 TipTap 확장)

```typescript
// packages/web/src/components/features/memo/image-block.tsx
// @tiptap/extension-image 대신 커스텀 ImageBlock 확장 (React NodeView)
// 기능: 리사이즈 (마우스/터치 드래그), 삭제 버튼 (X), 캡션 편집
// figure/figcaption 구조 HTML 직렬화, 기존 <img> 태그 하위호환 parseHTML
// setImage 커맨드: declare module '@tiptap/core' 타입 augmentation

// packages/web/src/components/features/memo/image-drop-plugin.ts
// ProseMirror 플러그인: handleDrop + handlePaste
// 이미지 파일 → /api/memo/image 업로드 → imageBlock 노드 삽입
// Decoration 기반 업로드 placeholder (스피너)
// MIME 검증 + 5MB 제한 (클라이언트 + 서버 이중)
```

## 코드블록 패턴 (CodeBlockLowlight + 커스텀 NodeView)

```typescript
// packages/web/src/components/features/memo/code-block-view.tsx
// React NodeView: 우측 상단 언어 셀렉터 (30개 언어 + "자동")
// lowlight common 번들: TS, JS, Python, Java, C/C++, Go, Rust, SQL 등

// 키보드 단축키 (memo-editor.tsx에서 extend):
// Cmd/Ctrl+A: 코드블록 내 커서일 때 해당 블록만 전체 선택
// 트리플 Enter (빈 줄 2개): 코드블록 탈출
// Cmd/Ctrl+Enter: 즉시 코드블록 탈출
// ArrowDown (마지막 줄, 문서 끝): 코드블록 아래로 이동
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
import { CalendarClient } from '@/components/features/calendar/calendar-client'
import { DashboardCalendar } from '@/components/features/calendar/dashboard-calendar'
import { EpisodeList } from '@/components/features/podcast/episode-list'
import { NotificationSettings } from '@/components/features/push/notification-settings'
import { MemoEditor } from '@/components/features/memo/memo-editor'
import { MemoList } from '@/components/features/memo/memo-list'
import { DashboardMemo } from '@/components/features/memo/dashboard-memo'
```
