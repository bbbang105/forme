# forme

개인 올인원 PWA - 큐레이션, 캘린더, 메모, 팟캐스트

## 프로젝트 구조

pnpm 모노레포: `packages/web` (Next.js 16 PWA) + `packages/shared` (DB 스키마, 타입, 유틸)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19, TypeScript |
| DB & Auth | Supabase (Auth + PostgreSQL + RLS) |
| ORM | Drizzle ORM (`packages/shared/src/schema/`) |
| 스토리지 | Cloudflare R2 (팟캐스트 음성) |
| 스타일링 | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 푸시알림 | web-push + Service Worker |
| RSS | feedsmith |
| 에디터 | TipTap (메모) |
| 패키지 관리 | pnpm workspace |
| 배포 | Vercel |

## 개발 명령어

```bash
pnpm install          # 의존성 설치
pnpm dev              # 개발 서버 (port 3200)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint
pnpm typecheck        # TypeScript 타입 체크
pnpm db:generate      # Drizzle 마이그레이션 생성
pnpm db:push          # 스키마 직접 push (dev용)
```

## 코딩 컨벤션

- Server Actions → `packages/web/src/lib/actions/`, Server Components 우선
- 인증 필요 페이지 → `(main)` route group, 비인증 → `(auth)` route group
- DB 접근 시 RLS 의존 (`auth.uid() = user_id`), 추가 권한 체크 불필요
- 스타일: Tailwind 유틸리티 클래스, 하드코딩 색상 금지 (CSS 변수 사용)
- 컴포넌트: shadcn/ui 기반, `components/ui/`에 위치

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `packages/web/src/proxy.ts` | Next.js 16 proxy (인증 리다이렉트) |
| `packages/web/src/app/(main)/layout.tsx` | 인증 레이아웃 + 하단 탭바 |
| `packages/web/src/app/(auth)/login/page.tsx` | Discord 로그인 |
| `packages/web/src/app/auth/callback/route.ts` | OAuth 콜백 (open redirect 방어) |
| `packages/web/src/lib/supabase/middleware.ts` | 세션 갱신 유틸 |
| `packages/web/src/lib/supabase/server.ts` | 서버 Supabase 클라이언트 |
| `packages/web/src/components/layout/tab-bar.tsx` | 하단 탭바 (5탭) |
| `packages/web/src/components/layout/header.tsx` | 헤더 (다크모드 토글) |
| `packages/shared/src/schema/` | Drizzle DB 스키마 |
| `packages/shared/src/db.ts` | DB 싱글톤 (SSL 강제) |
| `packages/web/public/sw.js` | Service Worker (PWA + 푸시) |
| `packages/web/src/app/manifest.ts` | PWA 매니페스트 (MetadataRoute) |

## 인증 구조

Discord OAuth → Supabase Auth → `proxy.ts`에서 세션 자동 갱신 (Next.js 16 방식).
RLS로 `auth.uid() = user_id` 강제. profiles 테이블로 멀티유저 확장 대비.
보안: CSP + HSTS + Permissions-Policy 헤더, open redirect 방어 적용.

## 디자인 시스템

study-admin 스타일: Sky Blue `#0ea5e9` 포인트, Pretendard 폰트, 다크모드 지원 (next-themes).

## 환경 변수

`.env.local` 참조. Supabase(URL, Anon Key, Service Key), R2(Access Key, Secret, Bucket), VAPID 키, Discord OAuth(Client ID/Secret).

## 브랜치 전략

`main` → `dev` (디폴트) → `feature/*` 브랜치. 워크트리 4개 병렬 개발.

## 참고 프로젝트

| 프로젝트 | 경로 | 참고 대상 |
|----------|------|-----------|
| study-admin | `/Users/hansangho/Desktop/study-admin` | Discord OAuth, RSS/큐레이션, UXUI 전체, 디자인 시스템 |
| hazel-admin | `/Users/hansangho/Desktop/hazel-admin` | 캘린더, 푸시알림, PWA 설정, Server Actions 패턴 |

구현 시 기능/UI 적극 참고할 것. study-admin의 UXUI를 거의 동일한 구조로 맞출 것.

## 상세 참조 문서

| 문서 | 내용 |
|------|------|
| `docs/plans/26-03-03-forme-design.md` | 전체 설계 문서 |
| `docs/26-03-03-schema-summary.md` | DB 스키마 요약 (테이블, FK, enum) |
| `docs/26-03-03-patterns.md` | 인증/API/ORM 코드 패턴 |
