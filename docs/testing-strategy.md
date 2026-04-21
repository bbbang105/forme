# 테스팅 전략

> 작성: 2026-04-21
> 적용 범위: `packages/web` (shared는 스키마/타입 전용이라 별도 테스트 없음)
> 도구: Vitest + jsdom + `vi.hoisted()` Proxy 기반 DB 목

## 목적

forme 프로젝트에서 회귀를 막고, 보안/데이터 무결성 침해를 조기에 탐지하고, 신규 기능 추가 시 최소한의 커버리지를 강제한다. 모든 PR은 CI에서 `lint + typecheck + build + test` 4단계를 통과해야 머지 가능.

## 테스트 계층

### 1. 정적 분석 / 회귀 가드

**위치**: `src/__tests__/*-consistency.test.ts`
**도구**: Node `fs` + RegExp
**목적**: 코드베이스 전체를 스캔해서 금지 패턴을 조기 탐지. rename PR 잔존물, deprecated 라우트, 보안 취약 API 호출 등.

**현재 존재**:
- `route-consistency.test.ts` — `/video/<id>`, `/note/<id>` (단수), `/memo*`, `/api/note/*` (단수) 패턴 금지

**추가 기준**: 새 rename PR을 머지하기 전에 반드시 이 테스트에 금지 패턴 추가.

### 2. 단위 테스트 — Server Actions

**위치**: `src/__tests__/*-actions.test.ts`
**목 패턴**: `vi.hoisted()` + Proxy 기반 DB 목 (`notes-actions.test.ts`, `calendar-actions.test.ts` 참조)

**각 Server Action마다 최소 3개 케이스**:
1. **인증 실패** — `setMockUser(null)` → `Unauthorized` throw 확인
2. **입력 검증 실패** — 잘못된 UUID / 초과 길이 / 잘못된 타입 등 → 적절한 에러 메시지
3. **정상 경로** — 유효 입력 → DB 호출 파라미터 검증

**RLS 의존 Action**: 다른 `user.id`로 접근 시 0건 반환되는지 확인하는 케이스 추가.

### 3. 단위 테스트 — Utilities

**위치**: `src/__tests__/` (또는 파일 옆 `*.test.ts`)
**대상**:
- `lib/validators.ts` — 각 regex의 경계값/unicode/escaped 문자
- `lib/url-safety.ts` — IPv4 사설망, IPv6 ULA/Link-Local, IPv4-mapped IPv6, localhost hostname
- `lib/cron-auth.ts` — timing-safe compare, 길이 무관, 캐시 만료
- `lib/discord.ts` — webhook 타임아웃, 잘못된 URL
- `lib/format-time.ts` — KST 시간대, 경계값

### 4. 통합 테스트 — API Routes

**방식**: Next.js 15+ 의 `NextRequest`/`NextResponse`를 직접 생성해서 라우트 핸들러 호출.

**각 mutating API마다 최소 4개 케이스**:
1. **미인증** → 401
2. **입력 검증 실패** (잘못된 JSON, UUID, 길이) → 400
3. **권한 없음** (다른 유저의 리소스 수정) → 403 또는 0건 업데이트
4. **정상 성공** → 200 + body 검증

**SSE 라우트 추가 규칙**: abort 시 cleanup, status 복구 (summarizing → collected) 동작 테스트.

### 5. 훅 테스트 — React

**위치**: `src/__tests__/hooks/*.test.ts`
**도구**: `@testing-library/react` `renderHook` + `act`
**대상**: 공통 훅 (`use-auto-save`, `use-pull-to-refresh`, `useInfiniteScroll`, `useFilterSync` 등)

**각 훅마다**:
- 초기 상태 검증
- 이벤트 트리거 → 예상 state 전환
- cleanup (언마운트) 시 타이머/리스너 해제

### 6. E2E (Playwright) — **현 단계 범위 밖**

Phase D 이후. 지금은 dev 서버 수동 확인으로 대체.

## 신규 기능 추가 시 필수 체크리스트

| 변경 유형 | 필수 테스트 |
|-----------|-------------|
| 새 Server Action | 인증 실패 + 검증 실패 + 정상 케이스 (최소 3개) |
| 새 mutating API route | 401 + 400 + ownership + 200 (최소 4개) |
| 새 util 함수 | 경계값 포함 최소 3개 케이스 |
| 새 React 훅 | 초기 상태 + 주요 이벤트 + cleanup (최소 3개) |
| 새 라우트 추가 | `route-consistency` 기존 패턴에 저촉 안 되는지 (자동) |
| 외부 URL fetch 추가 | `isSafeUrl` 호출 확인 + redirect 동작 테스트 |
| 새 정규식 (validators.ts) | 경계값 테스트 |
| rename PR | `route-consistency.test.ts` 에 deprecated 패턴 추가 |

## 목(mock) 패턴

### DB 목 — `vi.hoisted()` Proxy

모든 Drizzle 체이닝(`db.select().from().where()...`)을 단일 Proxy로 흡수하고 `_setResolve()`로 최종 반환값 주입. 예:

```ts
const { db: mockDb } = vi.hoisted(() => {
  let resolveValue: unknown = null;
  const proxy: any = new Proxy({}, {
    get(_, prop) {
      if (prop === '_setResolve') return (v: unknown) => { resolveValue = v; };
      if (prop === 'then') return (fn: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(fn);
      return () => proxy;
    }
  });
  return { db: proxy };
});

vi.mock('@forme/shared', () => ({ db: mockDb, notes: {} }));
```

자세한 구현은 `src/__tests__/notes-actions.test.ts:30-55` 참조.

### 인증 목

```ts
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: vi.fn().mockImplementation(async () => ({
      data: { user: _mockUser }, error: _mockUser ? null : new Error('Not authenticated'),
    })) },
  })),
}));
```

### 외부 fetch 목

`global.fetch`를 `vi.fn().mockResolvedValue(...)` 로 오버라이드. YouTube API, Innertube, RSS crawl, R2 업로드 등 외부 요청은 모두 실제 호출 방지.

## CI 통합

`.github/workflows/ci.yml` 에 4개 job:

| Job | 목적 |
|-----|------|
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `build` | `pnpm build` (프로덕션 빌드 가능 여부) |
| `test` | `pnpm -F @forme/web test --run` (Vitest) |

PR 머지 조건: 4개 전부 green. 하나라도 실패하면 머지 차단.

## 로컬 실행

```bash
# 전체 테스트
pnpm -F @forme/web test --run

# 파일별
pnpm -F @forme/web test --run src/__tests__/notes-actions.test.ts

# watch 모드
pnpm -F @forme/web test

# 커버리지 (필요 시 vitest.config.ts에 coverage 설정 추가)
pnpm -F @forme/web test --coverage
```

## PR 머지 전 수동 체크

자동화된 테스트는 "코드가 작성한 대로 동작하는지"만 검증. **"기능이 실제 사용자에게 동작하는지"는 테스트로 못 잡음**. 따라서 PR 머지 전 dev 서버에서 변경된 페이지/플로우 실제 확인 필수.

- 라우트 변경 → 브라우저에서 해당 경로 직접 클릭
- UI 변경 → 모바일/데스크톱 양쪽
- 데이터 플로우 변경 → optimistic update 성공/실패 경로

회고에서 도출된 규칙: 단위 테스트 pass만 믿고 "완료" 선언 금지.

## 테스트가 깨졌을 때

1. 에러 메시지 정독 — 무엇을 기대했고 실제로 무엇이 돌아왔는지
2. 로컬에서 해당 테스트만 실행 (`--run <path>`)
3. 원인이 **구현 버그**면 구현 수정
4. 원인이 **테스트가 틀림**이면 테스트 수정 (단, 왜 틀렸는지 commit message에 명시)
5. Flaky → 타이머/비동기 타이밍 확인. `vi.useFakeTimers()` 활용.

**금지**: 테스트 자체를 `it.skip` / `xit` 로 일시적으로 끄고 넘어가기. 머지 전에 반드시 해결.
