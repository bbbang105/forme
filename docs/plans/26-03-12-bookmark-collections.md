# 북마크 컬렉션 기능 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** 큐레이션 북마크에 유저 정의 컬렉션(폴더) 분류 기능 추가

**Architecture:** bookmark_collections 테이블 + curation_items.collectionId FK. 캘린더 카테고리와 동일한 CRUD 패턴. 북마크 탭에 컬렉션 칩 필터 + 카드별 컬렉션 지정 바텀시트 + 관리 다이얼로그.

**Tech Stack:** Drizzle ORM, Server Actions, shadcn/ui, Tailwind CSS 4

---

## Task 1: DB 스키마

**Files:**
- Create: `packages/shared/src/schema/bookmark-collections.ts`
- Modify: `packages/shared/src/schema/curation-items.ts` (collectionId 추가)
- Modify: `packages/shared/src/schema/index.ts` (export 추가)

## Task 2: Server Actions

**Files:**
- Create: `packages/web/src/lib/actions/collections.ts`
- Modify: `packages/web/src/app/api/curation/[id]/route.ts` (collectionId PATCH 지원)

## Task 3: 컬렉션 관리 다이얼로그

**Files:**
- Create: `packages/web/src/components/features/curation/collection-manager.tsx`

## Task 4: 컬렉션 지정 바텀시트

**Files:**
- Create: `packages/web/src/components/features/curation/collection-picker.tsx`

## Task 5: curation-feed 통합

**Files:**
- Modify: `packages/web/src/components/features/curation/curation-feed.tsx` (칩 필터 + 컬렉션 상태)
- Modify: `packages/web/src/components/features/curation/curation-card.tsx` (컬렉션 배지 + 지정 버튼)
