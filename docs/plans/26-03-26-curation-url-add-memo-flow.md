# 큐레이션 URL 수동 등록 + 메모→북마크 플로우 개선

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 큐레이션에 URL 수동 등록 기능 추가, 읽음 탭 메모 저장 시 자동 북마크 + 컬렉션 피커, InlineMemo 2줄 제한 해제

**Architecture:** "직접 추가" 시스템 소스를 유저별 자동 생성하여 수동 URL 아이템 귀속. 메모→북마크+피커 플로우는 비디오의 기존 패턴(`wasBookmarked` 체크 → `setPickerItemId`) 이식. InlineMemo의 `line-clamp-2` 제거.

**Tech Stack:** Next.js 16 API Route, Drizzle ORM, OG metadata 파싱 (HTML fetch + regex), SSE 없이 단순 POST (유튜브와 달리 자막/요약 불필요)

---

### Task 1: 큐레이션 URL 수동 등록 API

**Files:**
- Create: `packages/web/src/app/api/curation/add-url/route.ts`

- [ ] **Step 1: API 라우트 생성**

```typescript
// packages/web/src/app/api/curation/add-url/route.ts
import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationItems, curationSources, db} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {isSafeUrl} from '@/lib/url-safety';

const MANUAL_SOURCE_NAME = '직접 추가';

async function fetchOgMeta(url: string): Promise<{title: string; description: string | null; thumbnailUrl: string | null}> {
  try {
    const res = await fetch(url, {
      headers: {'User-Agent': 'Mozilla/5.0 (compatible; FormeBot/1.0)'},
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {title: url, description: null, thumbnailUrl: null};

    const html = await res.text();
    const getMetaContent = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
      const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
      return regex.exec(html)?.[1] ?? altRegex.exec(html)?.[1] ?? null;
    };

    const ogTitle = getMetaContent('og:title');
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = ogTitle ?? titleMatch?.[1]?.trim() ?? url;

    const description = getMetaContent('og:description') ?? getMetaContent('description');
    const thumbnailUrl = getMetaContent('og:image');

    return {
      title: title.slice(0, 500),
      description: description?.slice(0, 300) ?? null,
      thumbnailUrl: thumbnailUrl && isSafeUrl(thumbnailUrl) ? thumbnailUrl : null,
    };
  } catch {
    return {title: url, description: null, thumbnailUrl: null};
  }
}

export const POST = withTracing('POST /api/curation/add-url', async (request) => {
  // Auth
  const supabase = await createClient();
  const {data: {user}, error: authError} = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  // Parse body
  let body: {url: string; category?: string};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON body'}, {status: 400});
  }

  const {url, category = 'etc'} = body;

  // Validate URL
  if (!url || typeof url !== 'string') {
    return NextResponse.json({error: 'URL is required'}, {status: 400});
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return NextResponse.json({error: 'Invalid URL format'}, {status: 400});
  }

  if (!isSafeUrl(parsedUrl.href)) {
    return NextResponse.json({error: 'URL not allowed'}, {status: 400});
  }

  try {
    // Get or create "직접 추가" source for this user
    let [manualSource] = await db
      .select()
      .from(curationSources)
      .where(and(
        eq(curationSources.userId, user.id),
        eq(curationSources.name, MANUAL_SOURCE_NAME),
      ))
      .limit(1);

    if (!manualSource) {
      [manualSource] = await db.insert(curationSources).values({
        userId: user.id,
        name: MANUAL_SOURCE_NAME,
        url: 'manual://',
        category: 'etc',
        isActive: false, // 크롤 대상 아님
      }).returning();
    }

    // Check duplicate URL in this source
    const [existing] = await db
      .select({id: curationItems.id})
      .from(curationItems)
      .where(and(
        eq(curationItems.sourceId, manualSource.id),
        eq(curationItems.url, parsedUrl.href),
      ))
      .limit(1);

    if (existing) {
      return NextResponse.json({error: '이미 등록된 URL입니다'}, {status: 409});
    }

    // Fetch OG metadata
    const meta = await fetchOgMeta(parsedUrl.href);

    // Insert item
    const [item] = await db.insert(curationItems).values({
      sourceId: manualSource.id,
      title: meta.title,
      url: parsedUrl.href,
      description: meta.description,
      thumbnailUrl: meta.thumbnailUrl,
      category,
      tags: [],
      isRead: false,
      isBookmarked: false,
    }).returning();

    return NextResponse.json({
      id: item.id,
      title: item.title,
      url: item.url,
      description: item.description ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      category: item.category,
    }, {status: 201});
  } catch (err) {
    console.error('[POST /api/curation/add-url]', err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});
```

- [ ] **Step 2: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/api/curation/add-url/route.ts
git commit -m "feat: 큐레이션 URL 수동 등록 API (/api/curation/add-url)"
```

---

### Task 2: 큐레이션 AddUrlDialog 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/curation/add-url-dialog.tsx`

- [ ] **Step 1: 다이얼로그 컴포넌트 생성**

유튜브 AddUrlDialog 패턴 기반이지만 SSE 없이 단순 POST. 진행 단계: idle → fetching → done/error.

```typescript
// packages/web/src/components/features/curation/add-url-dialog.tsx
'use client';

import {useCallback, useRef, useState} from 'react';
import {Loader2, CheckCircle2, AlertCircle, Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Step = 'idle' | 'fetching' | 'done' | 'error';

interface AddUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function AddUrlDialog({open, onOpenChange, onComplete}: AddUrlDialogProps) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [meta, setMeta] = useState<{title?: string} | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setUrl('');
    setStep('idle');
    setErrorMsg('');
    setMeta(null);
  }, []);

  const handleClose = useCallback((o: boolean) => {
    if (!o) {
      abortRef.current?.abort();
      if (step === 'done') onComplete();
      reset();
    }
    onOpenChange(o);
  }, [step, onComplete, onOpenChange, reset]);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setStep('fetching');
    setErrorMsg('');
    setMeta(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/curation/add-url', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: url.trim()}),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setStep('error');
        setErrorMsg(data.error || '등록에 실패했습니다');
        return;
      }

      setMeta({title: data.title});
      setStep('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStep('error');
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
    }
  };

  const isProcessing = step === 'fetching';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md !max-h-fit !inset-y-auto !top-1/2 !-translate-y-1/2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            URL 직접 추가
          </DialogTitle>
          <DialogDescription>글 링크를 입력하면 자동으로 정보를 가져옵니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isProcessing && url.trim()) handleSubmit();
              }}
              placeholder="https://example.com/article"
              disabled={isProcessing || step === 'done'}
              aria-label="글 URL"
              className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
            />
            <Button
              onClick={handleSubmit}
              disabled={!url.trim() || isProcessing || step === 'done'}
              size="sm"
              className="h-10 px-4 shrink-0"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                '추가'
              )}
            </Button>
          </div>

          {step !== 'idle' && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3" aria-live="polite" {...(step === 'error' ? {role: 'alert'} : {})}>
              {meta && (
                <div className="text-sm">
                  <p className="font-medium line-clamp-2">{meta.title}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                {step === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
                ) : step === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                )}
                <span className="text-sm text-muted-foreground">
                  {step === 'fetching' ? '정보 가져오는 중...' : step === 'done' ? '등록 완료!' : errorMsg}
                </span>
              </div>

              {step === 'done' && (
                <Button size="sm" variant="outline" onClick={() => handleClose(false)} className="w-full">
                  확인
                </Button>
              )}
              {step === 'error' && (
                <Button size="sm" variant="outline" onClick={reset} className="w-full">
                  다시 시도
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/features/curation/add-url-dialog.tsx
git commit -m "feat: 큐레이션 AddUrlDialog 컴포넌트"
```

---

### Task 3: CurationFeed에 AddUrlDialog 연결 + 버튼 배치

**Files:**
- Modify: `packages/web/src/components/features/curation/curation-feed.tsx`

- [ ] **Step 1: import 추가 + state 추가**

curation-feed.tsx 상단에 import 추가:
```typescript
import {Plus} from 'lucide-react';
```

dynamic import 블록 아래에 AddUrlDialog lazy import 추가:
```typescript
const AddUrlDialog = dynamic(
  () => import('./add-url-dialog').then((m) => m.AddUrlDialog),
  { ssr: false }
);
```

CurationFeed 내부에 state 추가:
```typescript
const [addUrlOpen, setAddUrlOpen] = useState(false);
```

- [ ] **Step 2: statusActions 슬롯에 + 버튼 추가**

`statusActions` prop 내부의 `<SourceManager .../>` 바로 앞에 + 버튼 추가:
```tsx
<button
  type="button"
  onClick={() => setAddUrlOpen(true)}
  className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
  aria-label="URL 직접 추가"
>
  <Plus className="h-3.5 w-3.5" />
</button>
```

- [ ] **Step 3: CollectionPicker 아래에 AddUrlDialog 렌더링**

CollectionManager 다이얼로그 뒤에 추가:
```tsx
<AddUrlDialog
  open={addUrlOpen}
  onOpenChange={setAddUrlOpen}
  onComplete={() => fetchItems(null, false)}
/>
```

- [ ] **Step 4: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/features/curation/curation-feed.tsx
git commit -m "feat: 큐레이션 피드에 URL 직접 추가 버튼 + 다이얼로그 연결"
```

---

### Task 4: 읽음 탭 메모 → 자동 북마크 + 컬렉션 피커 (큐레이션)

**Files:**
- Modify: `packages/web/src/components/features/curation/curation-feed.tsx`

현재 `handleMemoChange`는 `shouldBookmark`로 자동 북마크만 하고 컬렉션 피커를 열지 않음. 비디오 패턴(`wasBookmarked` 체크 → `setCollectionPickerTarget`)을 이식.

- [ ] **Step 1: handleMemoChange에 itemsRef 기반 wasBookmarked 체크 + 피커 오픈 추가**

현재 코드 (curation-feed.tsx:310-335):
```typescript
const handleMemoChange = useCallback(async (id: string, memo: string | null) => {
    const shouldBookmark = memo !== null;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, memo, ...(shouldBookmark && !item.isBookmarked ? { isBookmarked: true } : {}) }
          : item
      )
    );

    const body: Record<string, unknown> = { memo };
    if (shouldBookmark) {
      body.isBookmarked = true;
    }

    const res = await fetch(`/api/curation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      fetchItems(null, false);
    }
  }, [fetchItems]);
```

변경 후:
```typescript
const handleMemoChange = useCallback(async (id: string, memo: string | null) => {
    const item = itemsRef.current.find((i) => i.id === id);
    const prevMemo = item?.memo ?? null;
    const wasBookmarked = item?.isBookmarked ?? false;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, memo, isBookmarked: memo ? true : i.isBookmarked }
          : i
      )
    );

    try {
      const res = await fetch(`/api/curation/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, memo: prevMemo, isBookmarked: wasBookmarked } : i
        )
      );
      return;
    }

    // 메모 추가 + 기존에 북마크 아니었으면 → 컬렉션 피커 자동 오픈
    if (memo && !wasBookmarked) {
      setCollectionPickerTarget(id);
    }
  }, []);
```

- [ ] **Step 2: 읽음 탭에서도 컬렉션 피커/맵 전달**

현재 CurationCard/CurationListRow에 `onCollectionPick`은 `isBookmarkTab`일 때만 전달됨:
```tsx
onCollectionPick={isBookmarkTab ? handleCollectionPick : undefined}
collectionMap={isBookmarkTab ? collectionMap : undefined}
```

읽음 탭에서도 컬렉션 아이콘이 보이도록 변경:
```tsx
onCollectionPick={(isBookmarkTab || status === 'read') ? handleCollectionPick : undefined}
collectionMap={(isBookmarkTab || status === 'read') ? collectionMap : undefined}
```

이 변경은 모바일 카드 그리드 + 데스크톱 리스트 뷰 **양쪽** 모두에 적용해야 함 (CurationCard, CurationListRow 각각).

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/features/curation/curation-feed.tsx
git commit -m "feat: 큐레이션 읽음 탭 메모 저장 시 자동 북마크 + 컬렉션 피커"
```

---

### Task 5: InlineMemo 2줄 제한 해제 (큐레이션 + 비디오)

**Files:**
- Modify: `packages/web/src/components/features/curation/curation-card.tsx`
- Modify: `packages/web/src/components/features/video/video-card.tsx`

두 파일 모두 InlineMemo의 읽기 모드에서 `line-clamp-2`를 제거.

- [ ] **Step 1: curation-card.tsx InlineMemo 수정**

curation-card.tsx 158번 줄:
```tsx
<span className="line-clamp-2 whitespace-pre-wrap">{initialMemo}</span>
```
→
```tsx
<span className="whitespace-pre-wrap">{initialMemo}</span>
```

- [ ] **Step 2: video-card.tsx InlineMemo 수정**

video-card.tsx 178번 줄:
```tsx
<span className="line-clamp-2 whitespace-pre-wrap">{initialMemo}</span>
```
→
```tsx
<span className="whitespace-pre-wrap">{initialMemo}</span>
```

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/features/curation/curation-card.tsx packages/web/src/components/features/video/video-card.tsx
git commit -m "fix: InlineMemo 2줄 제한 해제 (큐레이션 + 비디오 전체 메모 표시)"
```

---

### Task 6: PATCH API에 메모 저장 시 자동 북마크 로직 추가

**Files:**
- Modify: `packages/web/src/app/api/curation/[id]/route.ts`

현재 큐레이션 PATCH에서 메모 저장 시 자동 북마크가 서버측에는 없음 (클라이언트에서만 `isBookmarked: true` 전송). 비디오 API처럼 서버측에서도 `memo`가 있으면 `isBookmarked = true` 자동 설정.

- [ ] **Step 1: PATCH 핸들러 memo 처리에 자동 북마크 추가**

curation/[id]/route.ts 192-194번 줄:
```typescript
    if (memo !== undefined) {
      updateValues.memo = memo ? memo.slice(0, 500) : null;
    }
```
→
```typescript
    if (memo !== undefined) {
      updateValues.memo = memo ? memo.slice(0, 500) : null;
      if (memo) updateValues.isBookmarked = true;
    }
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/app/api/curation/[id]/route.ts
git commit -m "feat: 큐레이션 PATCH API 메모 저장 시 서버측 자동 북마크"
```

---

### Task 7: 통합 테스트 + 빌드 검증

- [ ] **Step 1: 타입체크**

Run: `cd /Users/hansangho/Desktop/forme && pnpm typecheck`
Expected: PASS

- [ ] **Step 2: 린트**

Run: `cd /Users/hansangho/Desktop/forme && pnpm lint`
Expected: PASS

- [ ] **Step 3: 빌드**

Run: `cd /Users/hansangho/Desktop/forme && pnpm build`
Expected: PASS

- [ ] **Step 4: 테스트**

Run: `cd /Users/hansangho/Desktop/forme && pnpm test`
Expected: PASS
