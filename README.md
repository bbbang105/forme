# forme

개인 올인원 PWA - 피드, 캘린더, 메모, 유튜브

## 기술 스택

- **프레임워크**: Next.js 16, React 19, TypeScript
- **DB & Auth**: Supabase (Auth + PostgreSQL + RLS)
- **ORM**: Drizzle ORM
- **스타일링**: Tailwind CSS 4 + shadcn/ui + Radix UI
- **에디터**: TipTap (리치 텍스트 메모)
- **스토리지**: Cloudflare R2 (이미지)
- **푸시알림**: web-push + Service Worker
- **패키지 관리**: pnpm workspace (모노레포)
- **배포**: Vercel

## 프로젝트 구조

```
packages/
  web/      # Next.js 16 PWA 앱
  shared/   # DB 스키마, 타입, 유틸
```

## 기능

- **피드**: RSS 피드 구독, 자동 수집, 카테고리/태그 필터, 즐겨찾기 소스 관리
- **캘린더**: 월간뷰 캘린더, 일정 CRUD, 투두 리스트, 스와이프 내비게이션
- **메모**: TipTap 기반 리치 텍스트 에디터, 자동저장, 고정/검색, 체크리스트
- **유튜브**: 채널 구독, 영상 수집, Gemini AI 요약, 북마크 컬렉션
- **푸시알림**: 새 피드 아이템 알림, 투두 리마인더

## 개발

```bash
pnpm install    # 의존성 설치
pnpm dev        # 개발 서버 (port 3200)
pnpm build      # 프로덕션 빌드
pnpm lint       # ESLint
pnpm typecheck  # TypeScript 타입 체크
pnpm test       # Vitest 테스트
```

## 환경 변수

`.env.local` 참조 - Supabase, Cloudflare R2, VAPID, Discord OAuth 설정 필요.

## 라이선스

Private
