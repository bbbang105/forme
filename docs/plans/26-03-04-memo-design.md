# 메모 기능 설계 문서

## 개요

iOS 기본 메모앱 느낌의 리치 텍스트 메모 기능. TipTap 에디터 기반, Apple Notes + Bear 스타일 UX.

## 디자인 결정

**접근 방식**: Apple Notes 스타일 (리스트 → 에디터 드릴다운) + 자동저장
- 폴더/태그 없이 flat 목록 + 고정(pin) + 검색으로 단순화 (YAGNI)
- study-admin의 TipTap 설정 재활용 (StarterKit + Link + Placeholder)
- 체크리스트(TaskList) 추가로 iOS 메모앱 느낌 강화

## DB 스키마

```sql
-- packages/shared/src/schema/memos.ts
memos (
  id          uuid PK default random,
  user_id     uuid NOT NULL,
  title       varchar(200),
  content     jsonb NOT NULL default '{}',  -- TipTap JSON
  content_text text NOT NULL default '',     -- 검색/미리보기용
  is_pinned   boolean NOT NULL default false,
  created_at  timestamptz NOT NULL default now(),
  updated_at  timestamptz NOT NULL default now()
)
-- 인덱스: (user_id, is_pinned, updated_at DESC)
```

## 라우트 구조

```
(main)/memo/
├── page.tsx              # 메모 목록 (Server Component)
├── new/page.tsx          # 새 메모 에디터
└── [id]/page.tsx         # 메모 편집 에디터
```

## 컴포넌트 구조

```
components/features/memo/
├── memo-list.tsx           # 메모 목록 (클라이언트, 검색/필터)
├── memo-card.tsx           # 목록 아이템 (제목+날짜+미리보기)
├── memo-editor.tsx         # TipTap 에디터 래퍼 (자동저장)
├── memo-toolbar.tsx        # 에디터 서식 툴바
├── memo-header.tsx         # 에디터 전용 헤더 (뒤로가기+삭제+고정)
└── dashboard-memo.tsx      # 대시보드 위젯
```

## 핵심 UX

### 메모 목록
- 상단 검색바 (contentText 기반 필터링)
- 고정 메모 섹션 → 일반 메모 섹션 (updatedAt DESC)
- 각 카드: 제목(bold) + 날짜(relative) + 미리보기 2줄
- 우하단 FAB로 새 메모 생성
- 스와이프 액션: 고정/삭제

### 에디터
- 전용 헤더: ← 뒤로 | 제목 | 고정/삭제 메뉴
- 제목: 큰 폰트 input (placeholder: "제목")
- 본문: TipTap 에디터 (placeholder: "내용을 입력하세요...")
- 하단 툴바: B I U S | H1 H2 | • 1. ☑ | 🔗
- 자동저장: 1초 debounce, 에디터 blur 시 즉시 저장
- 빈 메모 뒤로가기 시 자동 삭제

### TipTap Extensions
- StarterKit (Bold, Italic, Strike, Heading, Lists, Blockquote, HardBreak, History)
- Underline
- TaskList + TaskItem (체크리스트)
- Link
- Placeholder
- CharacterCount

## Server Actions

```
lib/actions/memos.ts
- getMemos()              # 전체 목록 (pinned first, updatedAt DESC)
- getMemo(id)             # 단건 조회
- createMemo()            # 생성 → id 반환
- updateMemo(id, data)    # 제목/내용/고정 업데이트
- deleteMemo(id)          # 삭제
- toggleMemoPin(id)       # 고정 토글
- searchMemos(query)      # contentText ILIKE 검색
```

## 대시보드 위젯

최근 메모 3개 표시 (제목 + 미리보기 1줄 + 수정일)
