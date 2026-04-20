# 팟캐스트 제거 + 큐레이션→피드 리네임 설계

**작성일**: 2026-04-20
**상태**: 설계 완료, 실행 대기
**관련 브랜치**: `feature/remove-podcast-gamification` (Phase 1), Phase 2용은 Phase 1 머지 후 별도 생성

## 배경

forme 앱의 구조를 정리한다. 세 가지 목표가 있다.

1. 사용하지 않는 팟캐스트 기능을 완전 제거한다.
2. 핵심 기능을 **캘린더 / 피드 / 유튜브 요약 / 메모** 네 가지로 재정의하고, "큐레이션"을 "피드"로 리네임한다.
3. 전체 UXUI를 리디자인한다.

본 문서는 **1번과 2번만** 다룬다. 3번(리디자인)은 IA가 확정된 뒤 별도 브레인스토밍 세션에서 다룬다.

## 실행 순서

```
Phase 1  팟캐스트 + 게이미피케이션 제거  →  PR 머지  →
Phase 2  큐레이션 → 피드 풀 리네임        →  PR 머지  →
Phase 3  전체 UXUI 리디자인 (별도 세션)
```

개인 PWA이므로 zero-downtime 전략은 과하다. 각 Phase는 단일 PR, 단일 배포로 처리한다.

## 확정된 설계 결정

| 항목 | 결정 |
|------|------|
| 대시보드 | 유지, 정보성 대시보드로 축소. 게이미피케이션(출석/미션/날씨/인사/최근 메모) 전부 제거. 최근 피드 + 유튜브 요약 + 다가오는 일정만 노출. |
| 리네임 스코프 | DB 테이블까지 포함한 전면 리네임 (`curation_items` → `feed_items`, `curation_sources` → `feed_sources`). |
| 탭바 구성 | 4탭 (피드 / 유튜브 / 캘린더 / 메모). 대시보드는 탭바 제외, 헤더 로고 진입. |

---

## Phase 1 — 팟캐스트 + 게이미피케이션 제거

### 삭제 대상 (코드)

**디렉터리 · 파일 전체 삭제**
- `packages/web/src/app/(main)/podcast/`
- `packages/web/src/app/api/podcast/`
- `packages/web/src/app/api/cron/podcast-reminder/`
- `packages/web/src/components/features/podcast/`
- `packages/web/src/components/features/dashboard/weather-widget.tsx`
- `packages/web/src/components/features/dashboard/daily-missions.tsx`
- `packages/web/src/components/features/dashboard/attendance-recorder.tsx`
- `packages/web/src/lib/actions/activity.ts`
- `packages/web/src/lib/weather.ts`
- `packages/web/src/lib/greetings.ts`
- `packages/shared/src/schema/podcast.ts`
- `packages/shared/src/schema/user-daily-activity.ts`

### 수정 대상 (코드)

- `packages/web/src/components/layout/tab-bar.tsx` — 팟캐스트 탭 항목 제거 (4탭)
- `packages/web/src/components/layout/layout-shell.tsx` — `PlayerProvider`, `MiniPlayer` 제거
- `packages/web/src/app/(main)/layout.tsx` — 팟캐스트 관련 참조 제거
- `packages/web/src/app/(main)/dashboard/page.tsx` — 정보성 대시보드로 재구성 (최근 피드 + 유튜브 요약 + 다가오는 일정만)
- `packages/web/src/app/manifest.ts` — 팟캐스트 관련 shortcut/icon 제거
- `packages/shared/src/schema/index.ts` — podcast / user-daily-activity export 제거
- `packages/shared/src/types/index.ts` — 관련 타입 export 제거
- `packages/web/src/lib/constants.ts` — 팟캐스트 관련 상수 제거
- `packages/web/src/lib/logger.ts` — 팟캐스트 관련 trace 참조 제거
- `vercel.json` — `podcast-reminder` cron 항목 제거
- `package.json` — 팟캐스트 전용 의존성이 있다면 제거 (오디오 관련 패키지 검토)

### 대시보드 재구성 상세

`(main)/dashboard/page.tsx`는 다음 세 위젯만 렌더:

1. **최근 피드** — `dashboard-curation.tsx` 계열 위젯을 정비 (Phase 2에서 이름 변경 예정, Phase 1에서는 그대로 유지)
2. **최근 유튜브 요약** — 신규 위젯. `video_items` 중 `status = 'summarized'` ORDER BY `createdAt` DESC LIMIT 5
3. **다가오는 일정** — 기존 `dashboard-calendar.tsx` 재활용

대시보드 상단의 인사 문구, 날씨, 데일리 미션, 출석 기록은 전부 제거한다.

### 삭제 대상 (DB)

```sql
BEGIN;
DROP TABLE IF EXISTS podcast_episodes CASCADE;
DROP TABLE IF EXISTS user_daily_activity CASCADE;
COMMIT;
```

- Drizzle 마이그레이션 파일로 생성한다 (`pnpm db:generate`).
- `podcast_episodes`를 참조하는 FK가 있다면 CASCADE로 정리.
- Supabase pg_cron job 중 팟캐스트 관련이 있으면 SQL로 제거. 없으면 no-op.

### 삭제 대상 (외부 리소스)

- **R2 버킷**: 팟캐스트 오디오 파일 수동 삭제 (코드 아닌 Cloudflare 콘솔에서 `podcast/` prefix 기준 일괄 삭제)
- 메모 이미지는 건드리지 않는다 (메모 기능 유지).

### 검증

```bash
# 팟캐스트/게이미피케이션 잔존 참조 검사
rg -i 'podcast|weather|greetings|daily[_-]?mission|attendance|activity' \
  packages/ --glob '!node_modules' --glob '!.next' --glob '!docs/'

# 빌드/타입/린트/테스트
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- `usePlayer()` 훅 import 전수 제거 확인.
- `user_daily_activity` 참조 쿼리 제로 확인.
- 로컬에서 각 탭 진입, 대시보드 진입 스모크 테스트.

---

## Phase 2 — 큐레이션 → 피드 풀 리네임

### 파일 · 디렉터리 rename

```
app/(main)/curation/              → app/(main)/feed/
app/api/curation/                 → app/api/feed/
app/api/cron/curation/            → app/api/cron/feed/
components/features/curation/     → components/features/feed/
```

파일 내부 명칭 변경:
- `curation-feed.tsx` → `feed-list.tsx`
- `curation-card.tsx` → `feed-card.tsx`
- `dashboard-curation.tsx` → `dashboard-feed.tsx`

나머지 파일(`add-url-dialog`, `collection-manager`, `collection-picker`, `source-card`, `source-manager`, `crawl-settings-form`, `crawl-progress`, `feed-filter-bar`, `mini-card-link`, `mini-card-thumbnail`)은 경로만 이동하고 파일명은 그대로 둔다.

### Schema rename

```
packages/shared/src/schema/curation-items.ts    → feed-items.ts
packages/shared/src/schema/curation-sources.ts  → feed-sources.ts
```

- TS 변수: `curationItems` → `feedItems`, `curationSources` → `feedSources`
- Drizzle 테이블명: `pgTable("curation_items", ...)` → `pgTable("feed_items", ...)`
- `packages/shared/src/schema/index.ts` export 업데이트
- `bookmark-collections`은 공용이므로 파일명 유지. 내부에 `curation_item_id` 같은 FK 컬럼이 있다면 `feed_item_id`로 컬럼명 변경 (확인 후 결정).

### DB 마이그레이션

```sql
BEGIN;
ALTER TABLE curation_items RENAME TO feed_items;
ALTER TABLE curation_sources RENAME TO feed_sources;
COMMIT;
```

- Postgres `ALTER TABLE RENAME`은 FK · 인덱스 · RLS 정책을 자동 유지한다.
- RLS 정책 이름은 레거시로 남지만 기능에 영향 없음 → 그대로 둔다 (과한 작업).
- `bookmark_collections`에 `curation_item_id` 컬럼이 있다면 `ALTER TABLE bookmark_collections RENAME COLUMN curation_item_id TO feed_item_id;` 추가.
- `drizzle-kit generate`로 마이그레이션 파일 생성 · 검토 후 커밋.

### URL · 라우팅

- `/curation` → `/feed`
- `/api/curation/*` → `/api/feed/*`
- `/api/cron/curation` → `/api/cron/feed`
- `vercel.json` cron 경로 업데이트
- `packages/web/src/proxy.ts` — `/api/curation` 하드코딩 참조 확인 후 업데이트 (`/api/cron/` prefix로 자동 우회되는 경우는 변경 불필요)
- `packages/web/public/sw.js` — 캐시 키에 `/curation` 하드코딩 있으면 업데이트

### UI 카피

- 한국어 라벨 **"큐레이션" → "피드"** 전수 치환
- 탭바 라벨, 페이지 타이틀, 빈 상태 문구, 토스트, 다이얼로그 제목, 설명 텍스트 등
- 에러 메시지, cron 로그 메시지도 포함

### 용어 충돌 안내

RSS 개념의 "feed"와 UI 섹션 "피드"가 한국어로 겹치지만, 단일 사용자 · 단일 컨텍스트이므로 실무상 문제 없음. 코드 내부의 `crawl-feed.ts` 등 RSS 처리 네이밍은 유지한다.

### 문서 · 설정 업데이트

- `CLAUDE.md` — 경로 테이블, 섹션 제목, 카피 전수 업데이트
- `docs/plans/` 내 기존 문서는 과거 기록이므로 rename · 본문 수정하지 않는다 (히스토리 보존)
- 본 설계 문서는 피드 용어로 작성됨

### 검증

```bash
# curation / 큐레이션 잔존 참조 제로 확인
rg -i 'curation|큐레이션' \
  packages/ --glob '!node_modules' --glob '!.next' --glob '!docs/plans/26-03*' --glob '!docs/plans/26-04-01*'

pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- 로컬에서 RSS 크롤 · URL 직접 추가 · 북마크 컬렉션 DnD 스모크 테스트
- Vercel 프리뷰에서 cron 수동 트리거 한 번 돌려 실패 없는지 확인

---

## Phase 3 — UXUI 리디자인 (별도 세션)

범위가 크고 시각적 결정이 많아 본 스펙에서는 다루지 않는다. Phase 1 · 2 머지 후 별도 브레인스토밍 세션으로 착수한다.

---

## 체크리스트

### Phase 1
- [ ] Drizzle 마이그레이션 생성 (`podcast_episodes`, `user_daily_activity` DROP)
- [ ] 코드 파일 · 디렉터리 삭제
- [ ] 대시보드 재구성 (인사/날씨/미션/출석 제거, 유튜브 요약 위젯 추가)
- [ ] 탭바 4탭으로 축소
- [ ] `layout-shell.tsx`에서 PlayerProvider · MiniPlayer 제거
- [ ] `vercel.json`, `manifest.ts`, `constants.ts` 정리
- [ ] `CLAUDE.md`에서 팟캐스트 · 게이미피케이션 섹션 제거
- [ ] 빌드 · 타입 · 린트 · 테스트 그린
- [ ] R2 버킷 팟캐스트 prefix 수동 정리 (콘솔)
- [ ] PR 생성 · 머지 · Vercel 배포 · 스모크 테스트

### Phase 2
- [ ] `dev`에서 `feature/rename-curation-to-feed` 브랜치 생성 (Phase 1 머지 후)
- [ ] 디렉터리 · 파일 rename
- [ ] Drizzle 스키마 변수 · 테이블명 rename
- [ ] Drizzle 마이그레이션 생성 (테이블 RENAME)
- [ ] URL 경로 업데이트 (라우트, `vercel.json`, `proxy.ts`, `sw.js`)
- [ ] UI 카피 전수 치환 (큐레이션 → 피드)
- [ ] `CLAUDE.md` 경로 · 용어 업데이트
- [ ] 빌드 · 타입 · 린트 · 테스트 그린
- [ ] 잔존 `curation|큐레이션` 참조 제로 확인
- [ ] PR 생성 · 머지 · Vercel 배포 · 스모크 테스트
