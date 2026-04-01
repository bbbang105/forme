import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {curationItems, curationSources, db} from '@forme/shared';
import {and, eq} from 'drizzle-orm';
import {withTracing} from '@/lib/logger';
import {isSafeUrl} from '@/lib/url-safety';

const MANUAL_SOURCE_NAME = '직접 추가';
const MANUAL_SOURCE_URL = 'manual://';
const VALID_CATEGORIES = ['ai', 'dev', 'uxui', 'economy'];

/** HTML에서 OG 메타데이터 추출 */
function parseOgMeta(html: string): {
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
} {
  const ogTitleMatch =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);

  const ogDescMatch =
    html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);

  const ogImageMatch =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  const rawTitle = ogTitleMatch?.[1] ?? titleTagMatch?.[1] ?? null;
  const rawDesc = ogDescMatch?.[1] ?? null;
  const rawImage = ogImageMatch?.[1] ?? null;

  const decode = (s: string | null) =>
    s
      ? s
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      : null;

  const title = decode(rawTitle)?.slice(0, 500) ?? null;
  const description = decode(rawDesc)?.slice(0, 300) ?? null;
  // decode 먼저 → isSafeUrl 검증 (HTML 엔티티로 SSRF 우회 방지)
  const decodedImage = decode(rawImage);
  const thumbnailUrl = decodedImage && isSafeUrl(decodedImage) ? decodedImage : null;

  return {title, description, thumbnailUrl};
}

/** OG 메타데이터 수집 (50KB streaming) */
async function fetchOgMeta(url: string) {
  let title: string | null = null;
  let description: string | null = null;
  let thumbnailUrl: string | null = null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; forme-bot/1.0; +https://forme.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        const reader = res.body?.getReader();
        if (reader) {
          const chunks: Uint8Array[] = [];
          let bytesRead = 0;
          const MAX_BYTES = 50_000;

          while (bytesRead < MAX_BYTES) {
            const {done, value} = await reader.read();
            if (done || !value) break;
            chunks.push(value);
            bytesRead += value.byteLength;
          }
          reader.cancel();

          const html = new TextDecoder().decode(
            chunks.reduce((acc, chunk) => {
              const merged = new Uint8Array(acc.length + chunk.length);
              merged.set(acc);
              merged.set(chunk, acc.length);
              return merged;
            }, new Uint8Array(0)),
          );

          ({title, description, thumbnailUrl} = parseOgMeta(html));
        }
      }
    }
  } catch {
    // OG 수집 실패는 무시
  }

  if (!title) {
    try {
      const u = new URL(url);
      title = u.hostname + (u.pathname !== '/' ? u.pathname : '');
    } catch {
      title = url.slice(0, 500);
    }
  }

  return {title, description, thumbnailUrl};
}

/**
 * POST /api/curation/add-url
 *
 * 2가지 모드:
 * 1. preview=true  → OG 메타만 조회하여 반환 (DB 저장 안 함)
 * 2. preview 없음  → 사용자 편집값으로 DB 저장
 *
 * Body (preview): { url, preview: true }
 * Body (save):    { url, title, description?, category?, tags? }
 */
export const POST = withTracing('POST /api/curation/add-url', async (request) => {
  // ── Auth ──
  const supabase = await createClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  // ── Input validation ──
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON body'}, {status: 400});
  }

  const rawUrl = body?.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return NextResponse.json({error: 'url is required'}, {status: 400});
  }

  const url = rawUrl.trim();

  if (!isSafeUrl(url)) {
    return NextResponse.json({error: 'Invalid or unsafe URL'}, {status: 400});
  }

  const isPreview = body?.preview === true;

  // ── Preview mode: OG 메타만 반환 ──
  if (isPreview) {
    const meta = await fetchOgMeta(url);
    return NextResponse.json({
      url,
      title: meta.title,
      description: meta.description,
      thumbnailUrl: meta.thumbnailUrl,
    });
  }

  // ── Save mode: 사용자 편집값으로 DB 저장 ──
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) : null;
  if (!title) {
    return NextResponse.json({error: 'title is required'}, {status: 400});
  }

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) || null : null;
  const category = typeof body.category === 'string' && VALID_CATEGORIES.includes(body.category) ? body.category : 'ai';
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 5) : [];

  try {
    // 1. "직접 추가" 시스템 소스 조회 또는 생성 (insert-first로 TOCTOU 방지)
    let [manualSource] = await db
      .select({id: curationSources.id})
      .from(curationSources)
      .where(and(eq(curationSources.userId, user.id), eq(curationSources.url, MANUAL_SOURCE_URL)))
      .limit(1);

    if (!manualSource) {
      try {
        const [created] = await db
          .insert(curationSources)
          .values({
            userId: user.id,
            name: MANUAL_SOURCE_NAME,
            url: MANUAL_SOURCE_URL,
            category: 'etc',
            isActive: false,
          })
          .returning({id: curationSources.id});
        manualSource = created;
      } catch {
        // 동시 요청으로 이미 생성된 경우 재조회
        [manualSource] = await db
          .select({id: curationSources.id})
          .from(curationSources)
          .where(and(eq(curationSources.userId, user.id), eq(curationSources.url, MANUAL_SOURCE_URL)))
          .limit(1);
      }
    }

    const sourceId = manualSource.id;

    // 2. 중복 URL 체크 (삭제된 아이템은 재등록 허용)
    const [existing] = await db
      .select({id: curationItems.id, deletedAt: curationItems.deletedAt})
      .from(curationItems)
      .where(and(eq(curationItems.sourceId, sourceId), eq(curationItems.url, url)))
      .limit(1);

    if (existing && !existing.deletedAt) {
      return NextResponse.json({error: '이미 등록된 URL입니다'}, {status: 409});
    }

    // 3. 썸네일 URL 검증
    const thumbnailUrl = typeof body.thumbnailUrl === 'string' && isSafeUrl(body.thumbnailUrl) ? body.thumbnailUrl : null;

    // 4. curationItems 삽입 (삭제된 아이템이면 복원)
    let inserted;
    if (existing?.deletedAt) {
      [inserted] = await db
        .update(curationItems)
        .set({
          title,
          description,
          thumbnailUrl,
          category,
          tags,
          isRead: false,
          isBookmarked: false,
          readAt: null,
          memo: null,
          collectionId: null,
          collectedAt: new Date(),
          deletedAt: null,
        })
        .where(eq(curationItems.id, existing.id))
        .returning();
    } else {
      [inserted] = await db
        .insert(curationItems)
        .values({
          sourceId,
          title,
          url,
          description,
          thumbnailUrl,
          category,
          tags,
          isRead: false,
          isBookmarked: false,
        })
        .returning();
    }

    return NextResponse.json(
      {
        id: inserted.id,
        sourceId: inserted.sourceId,
        title: inserted.title,
        url: inserted.url,
        description: inserted.description ?? null,
        thumbnailUrl: inserted.thumbnailUrl ?? null,
        publishedAt: inserted.publishedAt?.toISOString() ?? null,
        category: inserted.category,
        tags: inserted.tags ?? [],
        isRead: inserted.isRead,
        isBookmarked: inserted.isBookmarked,
        collectedAt: inserted.collectedAt.toISOString(),
        memo: inserted.memo ?? null,
        collectionId: inserted.collectionId ?? null,
      },
      {status: 201},
    );
  } catch (err) {
    console.error('[POST /api/curation/add-url]', err);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
});
