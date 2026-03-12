# 유튜브 영상 요약 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 탭바에 "유튜브" 탭을 추가하고, 채널 소스 등록 → 영상 수집 → Gemini 요약 → 마크다운 상세 페이지 기능 구현

**Architecture:** Drizzle 스키마 2개(video_sources, video_items) + API 라우트 7개 + 클라이언트 페이지 2개. 수집(RSS)과 요약(Gemini)을 분리하여 비용 최적화. SSE 스트리밍으로 요약 진행 표시.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase RLS, feedsmith, youtube-transcript, @google/generative-ai, react-markdown

**Spec:** `docs/plans/26-03-12-youtube-summary-design.md`

---

## Chunk 1: 스키마 + 검증 + 상수

### Task 1: Drizzle 스키마 — video_sources

**Files:**
- Create: `packages/shared/src/schema/video-sources.ts`
- Modify: `packages/shared/src/schema/index.ts`

- [ ] **Step 1: video_sources 스키마 작성**

```typescript
// packages/shared/src/schema/video-sources.ts
import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const videoSources = pgTable('video_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  channelId: varchar('channel_id', { length: 24 }).notNull(),
  channelName: varchar('channel_name', { length: 200 }).notNull(),
  channelThumbnail: text('channel_thumbnail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userChannelIdx: uniqueIndex('idx_video_sources_user_channel').on(table.userId, table.channelId),
}));
```

- [ ] **Step 2: index.ts에 export 추가**

`packages/shared/src/schema/index.ts` 에 추가:
```typescript
export * from './video-sources';
```

- [ ] **Step 3: 커밋**

```bash
git add packages/shared/src/schema/video-sources.ts packages/shared/src/schema/index.ts
git commit -m "feat: add video_sources Drizzle schema"
```

---

### Task 2: Drizzle 스키마 — video_items

**Files:**
- Create: `packages/shared/src/schema/video-items.ts`
- Modify: `packages/shared/src/schema/index.ts`

- [ ] **Step 1: video_items 스키마 작성**

```typescript
// packages/shared/src/schema/video-items.ts
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { videoSources } from './video-sources';

export const videoItems = pgTable('video_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceId: uuid('source_id').notNull().references(() => videoSources.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  channelName: text('channel_name').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('collected'),
  summarySource: text('summary_source'),
  summary: text('summary'),
  keywords: text('keywords').array(),
  oneLiner: text('one_liner'),
  summarizedAt: timestamp('summarized_at', { withTimezone: true }),
}, (table) => ({
  userVideoIdx: uniqueIndex('idx_video_items_user_video').on(table.userId, table.videoId),
  feedIdx: index('idx_video_items_feed').on(table.userId, table.status, table.publishedAt),
}));
```

- [ ] **Step 2: index.ts에 export 추가**

```typescript
export * from './video-items';
```

- [ ] **Step 3: 마이그레이션 생성 & push**

```bash
cd /Users/hansangho/Desktop/forme
pnpm db:generate
pnpm db:push
```

- [ ] **Step 4: 커밋**

```bash
git add packages/shared/src/schema/video-items.ts packages/shared/src/schema/index.ts
git commit -m "feat: add video_items Drizzle schema with indexes"
```

---

### Task 3: 검증 정규식 + 상수 추가

**Files:**
- Modify: `packages/web/src/lib/validators.ts`
- Modify: `packages/web/src/lib/constants.ts`

- [ ] **Step 1: validators.ts에 YouTube 정규식 추가**

```typescript
export const YOUTUBE_CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
```

- [ ] **Step 2: constants.ts에 영상 요약 상수 추가**

```typescript
// Video Summary
export const VIDEO_SUMMARIZE_BATCH_MAX = 3;
export const VIDEO_FEED_PAGE_SIZE = 20;
export const VIDEO_SUMMARIZING_TIMEOUT_MS = 10 * 60 * 1000; // 10분
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/lib/validators.ts packages/web/src/lib/constants.ts
git commit -m "feat: add YouTube validators and video summary constants"
```

---

## Chunk 2: 소스 관리 API + Gemini 유틸

### Task 4: 소스 관리 API — CRUD

**Files:**
- Create: `packages/web/src/app/api/video/sources/route.ts`
- Create: `packages/web/src/app/api/video/sources/[id]/route.ts`

- [ ] **Step 1: GET + POST /api/video/sources**

```typescript
// packages/web/src/app/api/video/sources/route.ts
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db, videoSources } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { YOUTUBE_CHANNEL_ID_REGEX } from '@/lib/validators';

export const GET = withTracing('GET /api/video/sources', async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sources = await db.select().from(videoSources)
    .where(eq(videoSources.userId, user.id))
    .orderBy(desc(videoSources.createdAt));

  return NextResponse.json(sources, {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const POST = withTracing('POST /api/video/sources', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { channelUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelUrl } = body;
  if (!channelUrl || typeof channelUrl !== 'string') {
    return NextResponse.json({ error: 'channelUrl is required' }, { status: 400 });
  }

  // Extract channelId from URL: youtube.com/channel/UCxxxxxx
  const match = channelUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (!match) {
    return NextResponse.json({
      error: '채널 URL은 youtube.com/channel/UC... 형식으로 입력해주세요',
    }, { status: 400 });
  }

  const channelId = match[1];
  if (!YOUTUBE_CHANNEL_ID_REGEX.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
  }

  // Fetch channel name from RSS feed
  let channelName = channelId;
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'forme-bot/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const text = await res.text();
      const nameMatch = text.match(/<author>\s*<name>([^<]+)<\/name>/);
      if (nameMatch) channelName = nameMatch[1].trim();
    }
  } catch {
    // 채널 이름 못 가져와도 등록은 진행
  }

  try {
    const [created] = await db.insert(videoSources).values({
      userId: user.id,
      channelId,
      channelName,
    }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('unique')) {
      return NextResponse.json({ error: '이미 등록된 채널입니다' }, { status: 409 });
    }
    throw e;
  }
});
```

- [ ] **Step 2: DELETE /api/video/sources/[id]**

```typescript
// packages/web/src/app/api/video/sources/[id]/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, videoSources } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { UUID_REGEX } from '@/lib/validators';

export const DELETE = withTracing('DELETE /api/video/sources/[id]', async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await db.delete(videoSources)
    .where(and(eq(videoSources.id, id), eq(videoSources.userId, user.id)))
    .returning({ id: videoSources.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
});
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/app/api/video/sources/
git commit -m "feat: add video sources CRUD API (GET/POST/DELETE)"
```

---

### Task 5: Gemini 유틸 라이브러리

**Files:**
- Create: `packages/web/src/lib/gemini.ts`

- [ ] **Step 1: Gemini 클라이언트 + 요약 함수 작성**

```typescript
// packages/web/src/lib/gemini.ts
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SUMMARY_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    oneLiner: { type: SchemaType.STRING, description: '한줄 요약' },
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: '키워드 (최대 7개)',
    },
    summaryMarkdown: { type: SchemaType.STRING, description: '마크다운 요약 전문' },
  },
  required: ['oneLiner', 'keywords', 'summaryMarkdown'],
};

const TRANSCRIPT_SYSTEM_PROMPT = `당신은 YouTube 영상 요약 전문가입니다.
아래 자막 텍스트를 분석하여 **3분 안에 읽고 핵심을 파악할 수 있도록** 마크다운으로 구조화하세요.

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기 (예: 서버 컴포넌트(Server Components))
3. 불필요한 인트로/아웃트로/홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- 영상의 주요 내용을 3~5개 bullet으로 정리
- 각 bullet은 1~2문장, **핵심 키워드는 볼드**
- "왜 중요한지"를 반드시 포함

### 상세 정리
영상의 흐름을 따라가며 섹션별로 정리합니다.
각 섹션은 #### 소제목 + 2~4문장 설명.
코드나 명령어가 언급되면 코드블록으로 표기.

### 실무 인사이트
- 이 영상에서 바로 적용할 수 있는 액션 아이템 2~3개
- "~하면 ~할 수 있다" 형태의 실행 가능한 문장

### 타임라인
| 시간 | 내용 |
|------|------|
| 00:00 | 섹션 설명 |

### 키워드
\`keyword1\` \`keyword2\` \`keyword3\` (최대 7개)

## 주의사항
- "상세 정리" 섹션이 전체 분량의 50% 이상을 차지해야 합니다
- 타임라인은 자막의 timestamp를 기반으로 실제 시간을 추정하세요
- 자막에 타임스탬프가 없으면 타임라인 섹션을 생략하세요
- 총 분량: 800~1200자 내외 (3분 읽기 기준)`;

const DESCRIPTION_SYSTEM_PROMPT = `당신은 YouTube 영상 요약 전문가입니다.
아래 영상 설명을 기반으로 **3분 안에 읽고 핵심을 파악할 수 있도록** 마크다운으로 구조화하세요.
자막이 아닌 영상 설명 기반이므로 타임라인 섹션은 생략하세요.

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기
3. 불필요한 홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- 3~5개 bullet, 각 1~2문장, **핵심 키워드 볼드**

### 상세 정리
섹션별 #### 소제목 + 2~4문장 설명.

### 실무 인사이트
- 바로 적용할 수 있는 액션 아이템 2~3개`;

export interface SummaryResult {
  oneLiner: string;
  keywords: string[];
  summaryMarkdown: string;
}

export async function summarizeVideo(
  content: string,
  source: 'transcript' | 'description',
): Promise<SummaryResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_SCHEMA,
    },
    systemInstruction: source === 'transcript'
      ? TRANSCRIPT_SYSTEM_PROMPT
      : DESCRIPTION_SYSTEM_PROMPT,
  });

  const result = await model.generateContent(content);
  const text = result.response.text();
  return JSON.parse(text) as SummaryResult;
}
```

- [ ] **Step 2: 패키지 설치**

```bash
cd /Users/hansangho/Desktop/forme
pnpm add -F @forme/web @google/generative-ai
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/lib/gemini.ts packages/web/package.json pnpm-lock.yaml
git commit -m "feat: add Gemini summarization utility with JSON schema"
```

---

### Task 6: 자막 추출 유틸

**Files:**
- Create: `packages/web/src/lib/youtube-transcript.ts`

- [ ] **Step 1: 자막 추출 + description 폴백**

```typescript
// packages/web/src/lib/youtube-transcript.ts
import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptResult {
  content: string;
  source: 'transcript' | 'description';
}

export async function fetchTranscript(
  videoId: string,
  description?: string | null,
): Promise<TranscriptResult> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }));

    if (items.length === 0) throw new Error('Empty transcript');

    const content = items.map((item) => item.text).join(' ');
    return { content, source: 'transcript' };
  } catch {
    // 자막 실패 → description 폴백
    if (description && description.trim().length > 50) {
      return { content: description, source: 'description' };
    }
    throw new Error('자막을 가져올 수 없고, 영상 설명도 부족합니다');
  }
}
```

- [ ] **Step 2: 패키지 설치**

```bash
pnpm add -F @forme/web youtube-transcript
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/lib/youtube-transcript.ts packages/web/package.json pnpm-lock.yaml
git commit -m "feat: add YouTube transcript extraction with description fallback"
```

---

## Chunk 3: 수집 + 요약 API

### Task 7: 수집 API — RSS에서 영상 목록 가져오기

**Files:**
- Create: `packages/web/src/app/api/video/collect/route.ts`

- [ ] **Step 1: POST /api/video/collect 구현**

```typescript
// packages/web/src/app/api/video/collect/route.ts
import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db, videoSources, videoItems } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { UUID_REGEX } from '@/lib/validators';
import { isSafeUrl } from '@/lib/url-safety';
import { parseFeed } from 'feedsmith';

interface CollectBody {
  sourceIds: string[];
  period: '3d' | '7d' | '30d' | { from: string; to: string };
}

function getPeriodDate(period: CollectBody['period']): Date {
  const now = new Date();
  if (typeof period === 'object') {
    return new Date(period.from);
  }
  const days = period === '3d' ? 3 : period === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export const POST = withTracing('POST /api/video/collect', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CollectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sourceIds, period } = body;
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return NextResponse.json({ error: 'sourceIds required' }, { status: 400 });
  }
  if (sourceIds.some((id) => !UUID_REGEX.test(id))) {
    return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
  }

  const since = getPeriodDate(period);

  // 등록된 소스 확인 (ownership)
  const sources = await db.select().from(videoSources)
    .where(and(
      eq(videoSources.userId, user.id),
      inArray(videoSources.id, sourceIds),
    ));

  if (sources.length === 0) {
    return NextResponse.json({ error: 'No valid sources' }, { status: 400 });
  }

  // 기존 videoId 조회 (중복 스킵용)
  const existingItems = await db.select({ videoId: videoItems.videoId })
    .from(videoItems)
    .where(eq(videoItems.userId, user.id));
  const existingVideoIds = new Set(existingItems.map((i) => i.videoId));

  const collected: Array<{ sourceId: string; sourceName: string; count: number }> = [];

  for (const source of sources) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
    if (!isSafeUrl(rssUrl)) continue;

    try {
      const res = await fetch(rssUrl, {
        headers: { 'User-Agent': 'forme-bot/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const feed = parseFeed(xml);
      if (!feed?.items) continue;

      const newItems = feed.items
        .filter((item) => {
          const videoId = item.id?.replace('yt:video:', '') || '';
          const pubDate = item.published ? new Date(item.published) : null;
          return videoId
            && !existingVideoIds.has(videoId)
            && pubDate && pubDate >= since;
        })
        .map((item) => ({
          userId: user.id,
          sourceId: source.id,
          videoId: item.id?.replace('yt:video:', '') || '',
          title: item.title || 'Untitled',
          description: item.description || null,
          thumbnailUrl: item.id
            ? `https://i.ytimg.com/vi/${item.id.replace('yt:video:', '')}/hqdefault.jpg`
            : null,
          channelName: source.channelName,
          publishedAt: item.published ? new Date(item.published) : null,
          status: 'collected' as const,
        }));

      if (newItems.length > 0) {
        await db.insert(videoItems).values(newItems).onConflictDoNothing();
        newItems.forEach((i) => existingVideoIds.add(i.videoId));
      }

      collected.push({
        sourceId: source.id,
        sourceName: source.channelName,
        count: newItems.length,
      });
    } catch {
      collected.push({ sourceId: source.id, sourceName: source.channelName, count: 0 });
    }
  }

  return NextResponse.json({ collected });
});
```

- [ ] **Step 2: 커밋**

```bash
git add packages/web/src/app/api/video/collect/route.ts
git commit -m "feat: add video collect API — RSS fetch with period filter and dedup"
```

---

### Task 8: 요약 API — SSE 스트리밍

**Files:**
- Create: `packages/web/src/app/api/video/summarize/route.ts`

- [ ] **Step 1: POST /api/video/summarize 구현**

```typescript
// packages/web/src/app/api/video/summarize/route.ts
import { and, eq, inArray } from 'drizzle-orm';
import { db, videoItems } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { UUID_REGEX } from '@/lib/validators';
import { VIDEO_SUMMARIZE_BATCH_MAX } from '@/lib/constants';
import { fetchTranscript } from '@/lib/youtube-transcript';
import { summarizeVideo } from '@/lib/gemini';

export const POST = withTracing('POST /api/video/summarize', async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: { itemIds: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { itemIds } = body;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return new Response('itemIds required', { status: 400 });
  }
  if (itemIds.length > VIDEO_SUMMARIZE_BATCH_MAX) {
    return new Response(`최대 ${VIDEO_SUMMARIZE_BATCH_MAX}개까지 선택 가능합니다`, { status: 400 });
  }
  if (itemIds.some((id) => !UUID_REGEX.test(id))) {
    return new Response('Invalid item ID', { status: 400 });
  }

  // 소유권 확인
  const items = await db.select().from(videoItems)
    .where(and(
      eq(videoItems.userId, user.id),
      inArray(videoItems.id, itemIds),
    ));

  if (items.length === 0) {
    return new Response('No valid items', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('start', { total: items.length });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        send('progress', { index: i, videoId: item.videoId, title: item.title, status: 'summarizing' });

        // status → summarizing
        await db.update(videoItems)
          .set({ status: 'summarizing' })
          .where(eq(videoItems.id, item.id));

        try {
          const transcript = await fetchTranscript(item.videoId, item.description);
          const result = await summarizeVideo(transcript.content, transcript.source);

          await db.update(videoItems)
            .set({
              status: 'summarized',
              summarySource: transcript.source,
              summary: result.summaryMarkdown,
              keywords: result.keywords,
              oneLiner: result.oneLiner,
              summarizedAt: new Date(),
            })
            .where(eq(videoItems.id, item.id));

          send('progress', {
            index: i,
            videoId: item.videoId,
            title: item.title,
            status: 'summarized',
            summarySource: transcript.source,
          });
        } catch (e) {
          await db.update(videoItems)
            .set({ status: 'failed' })
            .where(eq(videoItems.id, item.id));

          send('progress', {
            index: i,
            videoId: item.videoId,
            title: item.title,
            status: 'failed',
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }

      send('done', { total: items.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
```

- [ ] **Step 2: 커밋**

```bash
git add packages/web/src/app/api/video/summarize/route.ts
git commit -m "feat: add video summarize SSE API — transcript + Gemini + streaming"
```

---

### Task 9: 피드 API — 목록 + 상세 + 삭제

**Files:**
- Create: `packages/web/src/app/api/video/items/route.ts`
- Create: `packages/web/src/app/api/video/items/[id]/route.ts`

- [ ] **Step 1: GET /api/video/items 피드 목록**

```typescript
// packages/web/src/app/api/video/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { db, videoItems } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { VIDEO_FEED_PAGE_SIZE, VIDEO_SUMMARIZING_TIMEOUT_MS } from '@/lib/constants';

export const GET = withTracing('GET /api/video/items', async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') || 'summarized';
  const cursor = searchParams.get('cursor');
  const limit = VIDEO_FEED_PAGE_SIZE;

  // summarizing 타임아웃 리커버리
  await db.update(videoItems)
    .set({ status: 'collected' })
    .where(and(
      eq(videoItems.userId, user.id),
      eq(videoItems.status, 'summarizing'),
      lt(videoItems.collectedAt, new Date(Date.now() - VIDEO_SUMMARIZING_TIMEOUT_MS)),
    ));

  const conditions = [
    eq(videoItems.userId, user.id),
    eq(videoItems.status, status),
  ];

  if (cursor) {
    const [cursorDate, cursorId] = cursor.split('|');
    conditions.push(
      or(
        lt(videoItems.publishedAt, new Date(cursorDate)),
        and(
          eq(videoItems.publishedAt, new Date(cursorDate)),
          lt(videoItems.id, cursorId),
        ),
      )!,
    );
  }

  const rows = await db.select().from(videoItems)
    .where(and(...conditions))
    .orderBy(desc(videoItems.publishedAt), desc(videoItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? `${items[items.length - 1].publishedAt?.toISOString()}|${items[items.length - 1].id}`
    : null;

  return NextResponse.json({ items, nextCursor, hasMore }, {
    headers: { 'Cache-Control': 'no-store' },
  });
});
```

- [ ] **Step 2: GET + DELETE /api/video/items/[id]**

```typescript
// packages/web/src/app/api/video/items/[id]/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, videoItems } from '@forme/shared';
import { createClient } from '@/lib/supabase/server';
import { withTracing } from '@/lib/logger';
import { UUID_REGEX } from '@/lib/validators';

export const GET = withTracing('GET /api/video/items/[id]', async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const [item] = await db.select().from(videoItems)
    .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)));

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(item, {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const DELETE = withTracing('DELETE /api/video/items/[id]', async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await db.delete(videoItems)
    .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)))
    .returning({ id: videoItems.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
});
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/app/api/video/items/
git commit -m "feat: add video items feed API — list with cursor pagination, detail, delete"
```

---

## Chunk 4: 탭바 변경 + 유튜브 피드 UI

### Task 10: 하단 탭바 변경 — 홈 제거, 유튜브 추가

**Files:**
- Modify: `packages/web/src/components/layout/tab-bar.tsx`

- [ ] **Step 1: tabs 배열 수정**

`tab-bar.tsx`에서 tabs 배열 변경:
- `{ href: '/dashboard', label: '홈', icon: Home }` 제거
- `{ href: '/video', label: '유튜브', icon: PlayCircle }` 추가 (큐레이션 다음에)
- import에서 `Home` 제거, `PlayCircle` 추가

```typescript
const tabs = [
  { href: '/curation', label: '큐레이션', icon: Newspaper },
  { href: '/video', label: '유튜브', icon: PlayCircle },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/memo', label: '메모', icon: StickyNote },
  { href: '/podcast', label: '팟캐스트', icon: Headphones },
];
```

- [ ] **Step 2: 커밋**

```bash
git add packages/web/src/components/layout/tab-bar.tsx
git commit -m "feat: replace Home tab with YouTube tab in bottom navigation"
```

---

### Task 11: 유튜브 페이지 — 소스 관리 + 수집 바

**Files:**
- Create: `packages/web/src/app/(main)/video/page.tsx`
- Create: `packages/web/src/app/(main)/video/error.tsx`
- Create: `packages/web/src/components/features/video/video-feed.tsx`
- Create: `packages/web/src/components/features/video/video-source-bar.tsx`
- Create: `packages/web/src/components/features/video/collect-bar.tsx`

- [ ] **Step 1: page.tsx + error.tsx**

```typescript
// packages/web/src/app/(main)/video/page.tsx
import { Suspense } from 'react';
import { VideoFeedSkeleton } from '@/components/features/video/video-feed-skeleton';

const VideoFeed = dynamic(
  () => import('@/components/features/video/video-feed').then((m) => m.VideoFeed),
  { ssr: false, loading: () => <VideoFeedSkeleton /> },
);

import dynamic from 'next/dynamic';

export default function VideoPage() {
  return (
    <Suspense fallback={<VideoFeedSkeleton />}>
      <VideoFeed />
    </Suspense>
  );
}
```

```typescript
// packages/web/src/app/(main)/video/error.tsx
'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VideoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[video]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">문제가 발생했습니다</p>
      <Button variant="outline" size="sm" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: video-source-bar.tsx — 채널 소스 관리**

```typescript
// packages/web/src/components/features/video/video-source-bar.tsx
'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface VideoSource {
  id: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
  createdAt: string;
}

interface VideoSourceBarProps {
  sources: VideoSource[];
  onAdd: (channelUrl: string) => Promise<void>;
  onDelete: (id: string) => void;
}

export function VideoSourceBar({ sources, onAdd, onDelete }: VideoSourceBarProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onAdd(url.trim());
      setUrl('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {sources.map((source) => (
        <div
          key={source.id}
          className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm"
        >
          <span className="max-w-[120px] truncate">{source.channelName}</span>
          <button
            onClick={() => onDelete(source.id)}
            className="rounded-full p-0.5 hover:bg-destructive/10 transition-colors"
            aria-label={`${source.channelName} 삭제`}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-full gap-1">
            <Plus className="h-3.5 w-3.5" />
            채널 추가
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>유튜브 채널 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/channel/UC..."
                className="w-full rounded-md border bg-background px-3 py-2 text-base"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                youtube.com/channel/UC... 형식의 URL을 입력하세요
              </p>
              {error && (
                <p className="mt-1 text-xs text-destructive" role="alert" aria-live="polite">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? '등록 중...' : '등록'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: collect-bar.tsx — 기간 선택 + 수집 버튼**

```typescript
// packages/web/src/components/features/video/collect-bar.tsx
'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Period = '3d' | '7d' | '30d';

interface CollectBarProps {
  loading: boolean;
  onCollect: (period: Period) => void;
  disabled: boolean;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: '3d', label: '3일' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

export function CollectBar({ loading, onCollect, disabled }: CollectBarProps) {
  const [period, setPeriod] = useState<Period>('7d');

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === p.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        onClick={() => onCollect(period)}
        disabled={loading || disabled}
        className="gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? '수집 중...' : '수집'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add packages/web/src/app/(main)/video/ packages/web/src/components/features/video/
git commit -m "feat: add YouTube page shell — source bar, collect bar, error boundary"
```

---

### Task 12: 유튜브 피드 메인 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/video/video-feed.tsx`
- Create: `packages/web/src/components/features/video/video-card.tsx`
- Create: `packages/web/src/components/features/video/video-feed-skeleton.tsx`

- [ ] **Step 1: video-card.tsx — 카드 컴포넌트**

```typescript
// packages/web/src/components/features/video/video-card.tsx
'use client';

import { memo } from 'react';
import Image from 'next/image';
import { formatRelativeDate } from '@/lib/curation-utils';

export interface VideoItemData {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelName: string;
  publishedAt: string | null;
  status: string;
  oneLiner: string | null;
  summarySource: string | null;
  keywords: string[] | null;
}

interface VideoCardProps {
  item: VideoItemData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onClick?: (id: string) => void;
}

export const VideoCard = memo(function VideoCard({
  item,
  selected,
  onSelect,
  onClick,
}: VideoCardProps) {
  const isSummarized = item.status === 'summarized';

  return (
    <div
      className="group flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50 cursor-pointer"
      onClick={() => isSummarized ? onClick?.(item.id) : onSelect?.(item.id)}
    >
      {/* 체크박스 (새 영상 탭) */}
      {!isSummarized && onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(item.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 shrink-0 rounded border-muted-foreground"
        />
      )}

      {/* 썸네일 */}
      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.thumbnailUrl && (
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="144px"
          />
        )}
      </div>

      {/* 텍스트 */}
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.channelName}
          {item.publishedAt && ` · ${formatRelativeDate(item.publishedAt)}`}
        </p>
        {isSummarized && item.oneLiner && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground/80">
            {item.oneLiner}
          </p>
        )}
        {isSummarized && item.summarySource === 'description' && (
          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
            설명 기반
          </span>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: video-feed-skeleton.tsx**

```typescript
// packages/web/src/components/features/video/video-feed-skeleton.tsx
export function VideoFeedSkeleton() {
  return (
    <div className="space-y-4 p-4" role="status" aria-busy="true">
      {/* 소스 바 스켈레톤 */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      {/* 수집 바 스켈레톤 */}
      <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
      {/* 카드 스켈레톤 */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 rounded-lg border p-3">
          <div className="h-20 w-36 shrink-0 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: video-feed.tsx — 메인 피드 컴포넌트**

```typescript
// packages/web/src/components/features/video/video-feed.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VideoSourceBar, type VideoSource } from './video-source-bar';
import { CollectBar } from './collect-bar';
import { VideoCard, type VideoItemData } from './video-card';
import { VIDEO_SUMMARIZE_BATCH_MAX } from '@/lib/constants';

type StatusFilter = 'summarized' | 'collected';

export function VideoFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = (searchParams.get('status') as StatusFilter) || 'summarized';

  // State
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [items, setItems] = useState<VideoItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch sources
  const fetchSources = useCallback(async () => {
    const res = await fetch('/api/video/sources');
    if (res.ok) setSources(await res.json());
  }, []);

  // Fetch items
  const fetchItems = useCallback(async (reset = false) => {
    setLoading(true);
    const params = new URLSearchParams({ status });
    if (!reset && cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/video/items?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => reset ? data.items : [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    }
    setLoading(false);
  }, [status, cursor]);

  // Initial load
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setSelectedIds(new Set());
    fetchItems(true);
  }, [status]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) fetchItems(); },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, fetchItems]);

  // Handlers
  const handleAddSource = async (channelUrl: string) => {
    const res = await fetch('/api/video/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '등록 실패');
    }
    await fetchSources();
  };

  const handleDeleteSource = async (id: string) => {
    await fetch(`/api/video/sources/${id}`, { method: 'DELETE' });
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCollect = async (period: '3d' | '7d' | '30d') => {
    if (sources.length === 0) return;
    setCollecting(true);
    try {
      const res = await fetch('/api/video/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: sources.map((s) => s.id),
          period,
        }),
      });
      if (res.ok) {
        // 새 영상 탭으로 전환 후 리로드
        router.push('/video?status=collected');
      }
    } finally {
      setCollecting(false);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < VIDEO_SUMMARIZE_BATCH_MAX) next.add(id);
      return next;
    });
  };

  const handleSummarize = async () => {
    if (selectedIds.size === 0) return;
    setSummarizing(true);
    try {
      const res = await fetch('/api/video/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selectedIds) }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.status) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.videoId === data.videoId
                        ? { ...item, status: data.status }
                        : item,
                    ),
                  );
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }
      }
      setSelectedIds(new Set());
      fetchItems(true);
    } finally {
      setSummarizing(false);
    }
  };

  const handleStatusChange = (s: StatusFilter) => {
    router.push(`/video?status=${s}`);
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* 소스 관리 */}
      <VideoSourceBar
        sources={sources}
        onAdd={handleAddSource}
        onDelete={handleDeleteSource}
      />

      {/* 수집 바 */}
      <CollectBar
        loading={collecting}
        onCollect={handleCollect}
        disabled={sources.length === 0}
      />

      {/* 상태 칩 */}
      <div className="flex gap-2">
        {([
          { value: 'summarized' as const, label: '요약 완료' },
          { value: 'collected' as const, label: '새 영상' },
        ]).map((chip) => (
          <button
            key={chip.value}
            onClick={() => handleStatusChange(chip.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              status === chip.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* 요약하기 버튼 (새 영상 탭) */}
      {status === 'collected' && selectedIds.size > 0 && (
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {summarizing
            ? '요약 중...'
            : `선택한 ${selectedIds.size}개 영상 요약하기`}
        </button>
      )}

      {/* 피드 */}
      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">
            {status === 'summarized' ? '아직 요약된 영상이 없어요' : '새 영상이 없어요'}
          </p>
          <p className="text-xs">
            {status === 'summarized'
              ? '채널을 추가하고 영상을 수집해보세요'
              : '수집 버튼을 눌러 영상을 가져오세요'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={status === 'collected' ? handleSelect : undefined}
              onClick={(id) => router.push(`/video/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loading && <p className="text-center text-sm text-muted-foreground">불러오는 중...</p>}
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add packages/web/src/components/features/video/ packages/web/src/app/(main)/video/
git commit -m "feat: add YouTube feed page — source management, collection, status chips"
```

---

## Chunk 5: 상세 페이지 + 마크다운 렌더링

### Task 13: 마크다운 렌더러 컴포넌트

**Files:**
- Create: `packages/web/src/components/features/video/markdown-renderer.tsx`

- [ ] **Step 1: 패키지 설치**

```bash
pnpm add -F @forme/web react-markdown remark-gfm rehype-highlight
```

- [ ] **Step 2: 마크다운 렌더러 작성 (dynamic import용)**

```typescript
// packages/web/src/components/features/video/markdown-renderer.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add packages/web/src/components/features/video/markdown-renderer.tsx packages/web/package.json pnpm-lock.yaml
git commit -m "feat: add markdown renderer with syntax highlighting (dynamic import)"
```

---

### Task 14: 영상 상세 페이지

**Files:**
- Create: `packages/web/src/app/(main)/video/[id]/page.tsx`

- [ ] **Step 1: 상세 페이지 작성**

```typescript
// packages/web/src/app/(main)/video/[id]/page.tsx
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, videoItems } from '@forme/shared';
import { getAuthUser } from '@/lib/auth';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeDate } from '@/lib/curation-utils';

const MarkdownRenderer = dynamic(
  () => import('@/components/features/video/markdown-renderer').then((m) => m.MarkdownRenderer),
  { ssr: false, loading: () => <div className="animate-pulse space-y-3 py-4">{[1,2,3,4].map(i => <div key={i} className="h-4 rounded bg-muted" />)}</div> },
);

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  const [item] = await db.select().from(videoItems)
    .where(and(eq(videoItems.id, id), eq(videoItems.userId, user.id)));

  if (!item || item.status !== 'summarized') notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      {/* 뒤로가기 */}
      <Link
        href="/video"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        돌아가기
      </Link>

      {/* 썸네일 */}
      {item.thumbnailUrl && (
        <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-muted">
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
            priority
          />
        </div>
      )}

      {/* 제목 */}
      <h1 className="text-xl font-bold leading-tight">{item.title}</h1>

      {/* 메타 */}
      <p className="mt-2 text-sm text-muted-foreground">
        {item.channelName}
        {item.publishedAt && ` · ${formatRelativeDate(item.publishedAt.toISOString())}`}
        {item.summarySource === 'description' && (
          <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
            설명 기반
          </span>
        )}
      </p>

      {/* 키워드 */}
      {item.keywords && item.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 한줄 요약 */}
      {item.oneLiner && (
        <blockquote className="mt-4 border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground italic">
          {item.oneLiner}
        </blockquote>
      )}

      {/* 마크다운 요약 */}
      <div className="mt-6">
        <MarkdownRenderer content={item.summary!} />
      </div>

      {/* YouTube 원본 링크 */}
      <div className="mt-8">
        <Button asChild variant="outline" className="w-full gap-2">
          <a
            href={`https://www.youtube.com/watch?v=${item.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            YouTube에서 보기
          </a>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/web/src/app/(main)/video/[id]/
git commit -m "feat: add video detail page — markdown summary with keywords and metadata"
```

---

### Task 15: Supabase RLS + 빌드 확인

**Files:**
- Create: `supabase/video-rls.sql`

- [ ] **Step 1: RLS SQL 작성**

```sql
-- supabase/video-rls.sql
-- video_sources RLS
ALTER TABLE video_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video sources"
  ON video_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- video_items RLS
ALTER TABLE video_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video items"
  ON video_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Supabase 대시보드에서 SQL 실행** (수동)

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/hansangho/Desktop/forme
pnpm typecheck
pnpm build
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/video-rls.sql
git commit -m "feat: add RLS policies for video_sources and video_items"
```

---

## 의존성 그래프

```
Task 1 (video_sources 스키마) → Task 2 (video_items 스키마) → Task 4 (소스 API)
Task 3 (validators/constants) → Task 4, 7, 8, 9
Task 5 (Gemini 유틸) → Task 8 (요약 API)
Task 6 (자막 유틸) → Task 8 (요약 API)
Task 4 (소스 API) → Task 11 (소스 UI)
Task 7 (수집 API) → Task 11 (수집 UI)
Task 8 (요약 API) → Task 12 (피드 UI)
Task 9 (피드 API) → Task 12 (피드 UI)
Task 10 (탭바) — 독립
Task 13 (마크다운 렌더러) → Task 14 (상세 페이지)
Task 15 (RLS + 빌드) — 마지막
```
