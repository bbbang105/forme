# 유튜브 영상 요약 기능 설계

## 개요

하단 탭바에 "유튜브" 탭을 추가하고, 유튜브 채널을 소스로 등록하여 영상을 수집한 뒤 선택적으로 Gemini Flash-Lite를 이용해 마크다운 요약을 생성하는 기능.

기존 "홈" 탭은 제거하고, 대시보드는 헤더 `{f}` 로고를 `<Link href="/">` + `aria-label="대시보드로 이동"`으로 변경하여 진입.

## 핵심 플로우

```
채널 URL 등록 → "수집" 클릭 (기간 선택) → 영상 목록 표시
→ 체크박스로 선택 (최대 3개) → "요약하기" 클릭 → Gemini 마크다운 요약
→ 상세 페이지에서 구조화된 요약 열람
```

- 수집과 요약이 분리 — 수집은 비용 $0, 요약만 Gemini API 호출
- 수동 실행만 (자동화는 나중에 cron 추가로 확장)

## DB 스키마

### video_sources (유튜브 채널 소스)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid, PK | |
| userId | uuid, FK → auth.users | |
| channelId | varchar(24), NOT NULL | YouTube 채널 ID (`UC` + 22자) |
| channelName | varchar(200), NOT NULL | 채널명 |
| channelThumbnail | text, nullable | 채널 썸네일 URL |
| createdAt | timestamptz | |

- RLS: `auth.uid() = user_id`
- UNIQUE: `(userId, channelId)`

### video_items (수집/요약 영상)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid, PK | |
| userId | uuid, FK → auth.users | |
| sourceId | uuid, FK → video_sources, onDelete CASCADE | |
| videoId | text, NOT NULL | YouTube video ID |
| title | text, NOT NULL | 영상 제목 |
| description | text, nullable | 영상 설명 |
| thumbnailUrl | text, nullable | 썸네일 URL |
| channelName | text | 채널명 |
| publishedAt | timestamptz | 게시일 |
| collectedAt | timestamptz | 수집 시각 |
| status | text, NOT NULL | 'collected' \| 'summarizing' \| 'summarized' \| 'failed' |
| summarySource | text, nullable | 'transcript' \| 'description' (요약에 사용된 소스) |
| summary | text, nullable | 마크다운 요약 전문 |
| keywords | text[], nullable | 추출된 키워드 배열 |
| oneLiner | text, nullable | 한줄 요약 (피드 미리보기용) |
| summarizedAt | timestamptz, nullable | 요약 완료 시각 |

- RLS: `auth.uid() = user_id`
- UNIQUE: `(userId, videoId)` — 유저별 영상 중복 방지
- `duration`, `viewCount`는 v1에서 제외 (RSS에 미포함, 향후 YouTube Data API v3로 보강)

### 인덱스

```
idx_video_items_feed: (userId, status, publishedAt DESC) — 메인 피드 쿼리
idx_video_items_video_id: (userId, videoId) — UNIQUE 제약으로 자동 생성
idx_video_items_keywords: GIN(keywords) — 향후 키워드 검색용
```

### status 리커버리

`status='summarizing'`인 항목이 10분 이상 경과 시 → 다음 페이지 로드 또는 수집 시 `status='collected'`로 자동 리셋. UI에 재시도 버튼 표시.

## API 구조

모든 API 라우트에 `withTracing()` 래퍼 적용. 핸들러 순서: 인증(auth) → 입력 검증(UUID 등) → 비즈니스 로직.

### 소스 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/video/sources` | 채널 URL 등록 (channelId 추출 + 검증) |
| GET | `/api/video/sources` | 등록된 채널 목록 |
| DELETE | `/api/video/sources/[id]` | 채널 삭제 (CASCADE로 영상도 삭제) |

**채널 ID 추출 & 검증:**
- v1: `youtube.com/channel/UC...` 포맷만 허용
- `channelId`는 `YOUTUBE_CHANNEL_ID_REGEX` (`/^UC[a-zA-Z0-9_-]{22}$/`)로 검증 후 저장
- `@handle` URL은 v1에서 미지원 (향후 YouTube Data API `channels.list?forHandle=` 활용)
- 지원하지 않는 포맷 입력 시 에러 메시지: "채널 URL은 youtube.com/channel/UC... 형식으로 입력해주세요"

### 수집

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/video/collect` | 채널 RSS에서 영상 목록 fetch |

- body: `{ sourceIds: string[], period: '3d' | '7d' | '30d' | { from: string, to: string } }`
- YouTube RSS: `https://www.youtube.com/feeds/videos.xml?channel_id={id}`
- `isSafeUrl()` SSRF 체크 후 fetch (기존 `crawl-feed.ts` 패턴)
- `feedsmith`(기존 패키지)로 RSS 파싱
- 기간 필터 적용 → videoId 중복 스킵 → `status='collected'`로 저장
- 응답: 새로 수집된 영상 목록

### 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/video/summarize` | 선택 영상 자막 추출 + Gemini 요약 |

- body: `{ itemIds: string[] }` — **최대 3개** (`MAX_SUMMARIZE_BATCH = 3`, `lib/constants.ts`)
- SSE 스트리밍 (큐레이션 크롤 `api/curation/crawl` 패턴)
- 각 영상: 자막 추출 시도 → 실패 시 description 폴백 → Gemini API 호출 → DB 업데이트 → SSE 이벤트 전송
- `summarySource` 필드에 'transcript' 또는 'description' 기록
- description 폴백 시 UI에 "자막을 가져올 수 없어 영상 설명으로 요약했습니다" 표시
- 실패 시 `status='failed'`
- 모든 itemId에 UUID_REGEX 검증 적용

### 피드

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/video/items` | 영상 목록 (status/sourceId 필터, 커서 페이지네이션) |
| GET | `/api/video/items/[id]` | 영상 상세 (마크다운 요약 포함) |
| DELETE | `/api/video/items/[id]` | 영상 삭제 |

**커서 페이지네이션:**
```
Query: ?status=summarized&cursor=<publishedAt ISO>&limit=20
Response: { items: [...], nextCursor: "<publishedAt>|<uuid>" | null }
```

## Gemini 응답 포맷

Gemini에 JSON 구조 응답을 요청하여 `oneLiner`, `keywords`, `summaryMarkdown`를 안정적으로 추출:

```json
{
  "oneLiner": "한줄 요약 텍스트",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "summaryMarkdown": "## 핵심 내용\n..."
}
```

`response_mime_type: "application/json"` + `response_schema`로 강제.

## Gemini 요약 프롬프트

```
당신은 YouTube 영상 요약 전문가입니다.
아래 자막 텍스트를 분석하여 **3분 안에 읽고 핵심을 파악할 수 있도록** 마크다운으로 구조화하세요.

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기 (예: 서버 컴포넌트(Server Components))
3. 불필요한 인트로/아웃트로/홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## 출력 구조

### 한줄 요약
> 이 영상을 한 문장으로 요약 (볼드 키워드 포함)

### 핵심 내용
- 영상의 주요 내용을 3~5개 bullet으로 정리
- 각 bullet은 1~2문장, **핵심 키워드는 볼드**
- "왜 중요한지"를 반드시 포함

### 상세 정리
영상의 흐름을 따라가며 섹션별로 정리합니다.
각 섹션은 `####` 소제목 + 2~4문장 설명.
코드나 명령어가 언급되면 코드블록으로 표기.

### 실무 인사이트
- 이 영상에서 바로 적용할 수 있는 액션 아이템 2~3개
- "~하면 ~할 수 있다" 형태의 실행 가능한 문장

### 타임라인
| 시간 | 내용 |
|------|------|
| 00:00 | 섹션 설명 |
| 03:20 | 섹션 설명 |

### 키워드
`keyword1` `keyword2` `keyword3` (최대 7개)

## 주의사항
- "상세 정리" 섹션이 전체 분량의 50% 이상을 차지해야 합니다
- 타임라인은 자막의 timestamp를 기반으로 실제 시간을 추정하세요
- 자막에 타임스탬프가 없으면 타임라인 섹션을 생략하세요
- 총 분량: 800~1200자 내외 (3분 읽기 기준)
```

**description 폴백 시 프롬프트 변형:**
- "아래 영상 설명을 기반으로" + 타임라인 섹션 생략 안내 추가

## UI 구조

### 하단 탭바 변경

```
기존: 홈 | 큐레이션 | 캘린더 | 메모 | 팟캐스트
변경: 큐레이션 | 유튜브 | 캘린더 | 메모 | 팟캐스트
```

- 홈(대시보드): 헤더 `{f}` 로고 `<Link href="/">` + `aria-label="대시보드로 이동"`
- 유튜브 탭 아이콘: lucide-react `Youtube` 또는 `PlayCircle`

### 유튜브 페이지 (`/video`)

**소스 관리 영역** (상단)
- 등록된 채널 칩 목록 (썸네일 + 이름, X 삭제)
- "채널 추가" 버튼 → 다이얼로그에서 YouTube 채널 URL 입력

**수집 바**
- 기간 선택: `3일` | `7일` | `30일` | `직접 설정`
- "수집" 버튼 → RSS에서 영상 가져옴

**상태 칩** (큐레이션 패턴)
- `요약 완료` (디폴트) | `새 영상`
- URL param: `?status=summarized` (디폴트) / `?status=collected`

**새 영상 탭**
- 체크박스 + 썸네일 + 제목 + 채널명 + 게시일
- "선택한 영상 요약하기" 버튼 (최대 3개) → SSE 진행 표시

**요약 완료 탭**
- 썸네일 + 제목 + 한줄 요약 미리보기
- `summarySource='description'`인 경우 "설명 기반" 뱃지 표시
- 클릭 → `/video/[id]` 상세 페이지

### 상세 페이지 (`/video/[id]`)

- 뒤로가기 버튼
- 썸네일 (16:9)
- 제목 (큰 폰트)
- 메타: 채널명 · 게시일
- 키워드 뱃지
- 마크다운 요약 본문 (`react-markdown` + `remark-gfm` + `rehype-highlight`)
- "YouTube에서 보기" 버튼

### 라우트 구조

```
app/(main)/video/
├── page.tsx          피드 (소스관리 + 수집 + 목록)
├── [id]/page.tsx     상세 (마크다운 요약)
└── error.tsx         에러 바운더리
```

### 컴포넌트 패턴

- 마크다운 렌더러: `next/dynamic` + `ssr: false` (rehype-highlight 번들 크기 대응)
- 리스트 아이템: `React.memo` 적용 (VideoCard)
- 무거운 컴포넌트: `next/dynamic` 지연 로딩

## 기술 스택

| 영역 | 기술 |
|------|------|
| RSS 파싱 | feedsmith (기존) |
| 자막 추출 | youtube-transcript (npm), 실패 시 description 폴백 |
| AI 요약 | @google/generative-ai — gemini-2.5-flash-lite (JSON 모드) |
| 마크다운 렌더링 | react-markdown + remark-gfm + rehype-highlight (dynamic import) |
| 채널 ID 검증 | `YOUTUBE_CHANNEL_ID_REGEX` in `lib/validators.ts` |

## 검증 규칙 (lib/validators.ts 추가)

```typescript
export const YOUTUBE_CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
```

## 비용 추정

Gemini 2.5 Flash-Lite 기준:
- Input: $0.10 / 1M tokens
- Output: $0.40 / 1M tokens

영상 1개 요약: input ~4,500 + output ~1,000 tokens ≈ $0.00085
- 하루 15개 요약 시 월 ~$0.38
- Free Tier 사용 시 $0

## 환경변수

```
GEMINI_API_KEY=...  # Google AI Studio에서 발급
```

## 향후 확장

- `api/cron/video-collect` 추가 → 자동 수집 (수집 API 재활용)
- 자동 요약: 수집 후 바로 summarize API 호출
- `@handle` URL 지원: YouTube Data API v3 `channels.list?forHandle=` 활용
- `duration`/`viewCount` 보강: YouTube Data API v3 `videos.list?part=contentDetails,statistics`
- 검색: keywords GIN 인덱스 + title 풀텍스트 검색
- 북마크/컬렉션: 큐레이션 패턴 재활용
