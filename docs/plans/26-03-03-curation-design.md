# 큐레이션 기능 설계

> 작성일: 2026-03-03
> 상태: 승인됨

## 개요

RSS 기반 개인 큐레이션 피드. 소스 관리 + 자동/수동 수집 + 카테고리/상태 필터 + 무한스크롤.
study-admin 큐레이션 구조를 개인용(RLS, admin 분리 없음)으로 단순화.

## 설계 결정 사항

| 항목 | 결정 |
|------|------|
| 소스 관리 | 앱 내 직접 관리 (Bottom Sheet) |
| 카테고리 | 사용자 정의 (기본: ai, uxui, economy) |
| 수집 방식 | 수동(앱 내 버튼) + 자동(Vercel Cron 매일 1회) |
| 아티클 상태 | 읽음/안읽음 + 북마크 |
| 페이지네이션 | 커서 기반 (published_at, id) |
| RSS 파서 | feedsmith |

## DB 스키마

### curation_sources

```sql
CREATE TABLE curation_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  url TEXT NOT NULL,
  rss_url TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'ai',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE curation_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources_select" ON curation_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sources_insert" ON curation_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sources_update" ON curation_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sources_delete" ON curation_sources FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sources_user ON curation_sources(user_id);
```

### curation_items

```sql
CREATE TABLE curation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES curation_sources(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  category VARCHAR(50) NOT NULL,
  tags TEXT[],
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_bookmarked BOOLEAN NOT NULL DEFAULT false,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- items는 source의 RLS를 통해 간접 보호 (source_id FK)
-- 직접 RLS도 추가: source의 user_id 확인
ALTER TABLE curation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_select" ON curation_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));
CREATE POLICY "items_update" ON curation_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));
CREATE POLICY "items_delete" ON curation_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()));

CREATE INDEX idx_items_published ON curation_items(published_at DESC, id DESC);
CREATE INDEX idx_items_category ON curation_items(category);
CREATE INDEX idx_items_bookmarked ON curation_items(is_bookmarked) WHERE is_bookmarked = true;
CREATE INDEX idx_items_source ON curation_items(source_id);

-- URL 중복 방지 (같은 소스 내)
CREATE UNIQUE INDEX idx_items_source_url ON curation_items(source_id, url);
```

## UI/UX 구조

### 피드 페이지 (`/curation`)

```
┌──────────────────────────────┐
│ 헤더: 큐레이션                │
├──────────────────────────────┤
│ [전체] [AI] [UXUI] [경제] [+] │ ← 카테고리 필터 (가로 스크롤)
├──────────────────────────────┤
│ [🔍 검색]       [⚙️ 소스관리]  │
├──────────────────────────────┤
│ [모든 글] [안읽은 글] [★ 북마크]│ ← 상태 필터 칩
├──────────────────────────────┤
│ ┌────────────────────────┐   │ ← 모바일: 1열 풀너비
│ │     썸네일 16:9         │   │
│ │ 제목                    │   │
│ │ 출처 · 2시간 전          │   │
│ │ 🏷AI              ★ 📖 │   │ ← 카테고리 뱃지, 북마크, 읽음표시
│ └────────────────────────┘   │
│          ↓ 무한스크롤 ↓       │
├──────────────────────────────┤
│  홈  큐레  캘린  메모  팟캐    │
└──────────────────────────────┘
```

태블릿+(≥640px): `grid-cols-2`

### 소스 관리 (Bottom Sheet / Dialog)

```
┌──────────────────────────────┐
│ ─── (드래그 핸들)             │
│ 소스 관리                     │
├──────────────────────────────┤
│ [+ 소스 추가]   [지금 수집 🔄] │
├──────────────────────────────┤
│ 📰 GeekNews         AI   ✓  │
│ 📰 UXUI Weekly     UXUI  ✓  │
│ 📰 경제 브리핑      경제  ✗  │ ← 비활성
│   (스와이프 → 삭제)           │
└──────────────────────────────┘
```

### 인터랙션

| 액션 | 동작 |
|------|------|
| 카드 탭 | 외부 링크 새 탭 + is_read=true |
| 북마크 아이콘 탭 | is_bookmarked 토글 (낙관적 업데이트) |
| 카테고리 [+] | 새 카테고리 추가 다이얼로그 |
| 소스 관리 → 수집 | SSE 스트리밍 진행률 |
| 검색 | 300ms 디바운스, title+description ILIKE |
| 상태 필터 칩 | 모든 글 / 안읽은 글(is_read=false) / 북마크(is_bookmarked=true) |

## API 라우트

```
GET    /api/curation
       ?category=ai&status=unread|bookmarked&search=키워드&cursor=날짜|id&limit=12
       → { items, nextCursor, hasMore }

PATCH  /api/curation/[id]
       body: { is_read?, is_bookmarked? }

GET    /api/curation/sources
       → 소스 목록

POST   /api/curation/sources
       body: { name, url, category, rss_url? }
       → rss_url 없으면 HTML에서 자동 감지

PATCH  /api/curation/sources/[id]
       body: { name?, category?, is_active? }

DELETE /api/curation/sources/[id]
       → CASCADE 삭제

POST   /api/curation/crawl
       → SSE 스트리밍 (start → processing → progress → complete)

GET    /api/cron/curation  (Vercel Cron, Authorization: Bearer CRON_SECRET)
       → 활성 소스 전체 자동 수집
```

## 크롤 시스템

1. 활성 소스 목록 조회
2. 각 소스의 rss_url로 feedsmith 파싱
3. 기존 URL 중복 체크 → 새 아이템만 필터
4. OG image 추출 (5초 타임아웃, 실패 시 null)
5. description: HTML 태그 제거 + 300자 제한
6. category/tags: source에서 상속
7. DB insert (bulk)

SSE 이벤트:
- `start`: { totalSources }
- `processing`: { sourceName, index }
- `progress`: { sourceName, newItems, skipped }
- `complete`: { totalNew, totalSkipped, errors }

## Vercel Cron 설정

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/curation",
      "schedule": "0 6 * * *"
    }
  ]
}
```

매일 오전 6시(UTC) = 한국 오후 3시에 자동 수집.

## 컴포넌트 구조

```
src/components/features/curation/
  ├── curation-feed.tsx          ← 피드 메인 (필터 + 무한스크롤)
  ├── curation-card.tsx          ← 아티클 카드
  ├── curation-filters.tsx       ← 카테고리 + 상태 필터 칩
  ├── curation-search.tsx        ← 검색바 (디바운스)
  ├── source-manager.tsx         ← 소스 관리 Bottom Sheet
  ├── source-form.tsx            ← 소스 추가/수정 폼
  ├── crawl-progress.tsx         ← SSE 수집 진행률
  └── curation-utils.ts          ← 유틸 (gradient, 날짜 포맷 등)

src/app/(main)/curation/
  └── page.tsx                   ← 서버 컴포넌트 엔트리

src/app/api/curation/
  ├── route.ts                   ← GET (피드 조회)
  ├── [id]/route.ts              ← PATCH (읽음/북마크)
  ├── sources/
  │   ├── route.ts               ← GET/POST (소스 목록/추가)
  │   └── [id]/route.ts          ← PATCH/DELETE (소스 수정/삭제)
  └── crawl/route.ts             ← POST (수집 SSE)

src/app/api/cron/
  └── curation/route.ts          ← GET (자동 수집)

packages/shared/src/schema/
  ├── curation-sources.ts
  └── curation-items.ts
```

## 참고

- study-admin 큐레이션: `/Users/hansangho/Desktop/study-admin/packages/web/src/app/(user)/curation/`
- feedsmith: RSS/Atom/JSON Feed 파싱
- OG image: fetch + HTML meta tag 파싱 (5초 타임아웃)
