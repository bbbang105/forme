# DB 스키마 요약

## 테이블 관계도

```
auth.users (Supabase 관리)
  └── profiles (1:1)
  └── curation_sources (1:N)
        └── curation_items (1:N)
  └── calendar_events (1:N)
  └── todos (1:N)
  └── memos (1:N)
  └── podcast_episodes (1:N)
  └── push_subscriptions (1:N)
```

모든 테이블에 `user_id` FK → RLS `auth.uid() = user_id` 적용.

## Enum 값

| Enum | 값 |
|------|-----|
| curation_category | `ai`, `uxui`, `economy` |
| source_type | `article`, `paper`, `youtube`, `mixed` |
| event_color | `#f43f5e`, `#a855f7`, `#3b82f6`, `#10b981`, `#f59e0b`, `#6b7280` |

## 테이블별 컬럼

### profiles

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users, UNIQUE |
| discord_id | VARCHAR | NOT NULL | |
| discord_username | VARCHAR | NOT NULL | |
| display_name | VARCHAR | NULL | |
| avatar_url | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### curation_sources

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| name | VARCHAR | NOT NULL | |
| url | TEXT | NOT NULL | |
| rss_url | TEXT | NULL | |
| category | VARCHAR | NOT NULL | ai / uxui / economy |
| is_active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### curation_items

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| source_id | UUID | NOT NULL | FK → curation_sources |
| title | VARCHAR | NOT NULL | |
| url | TEXT | NOT NULL | |
| description | TEXT | NULL | |
| thumbnail_url | TEXT | NULL | |
| published_at | TIMESTAMPTZ | NULL | |
| category | VARCHAR | NOT NULL | |
| tags | TEXT[] | NULL | |
| is_read | BOOLEAN | NOT NULL | DEFAULT false |
| collected_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### calendar_events

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| title | VARCHAR | NOT NULL | |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| color | VARCHAR | NOT NULL | DEFAULT '#f43f5e' |
| description | TEXT | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### todos

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| date | DATE | NOT NULL | |
| content | TEXT | NOT NULL | |
| is_completed | BOOLEAN | NOT NULL | DEFAULT false |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
| reminder_at | TIMESTAMPTZ | NULL | |
| reminder_sent | BOOLEAN | NOT NULL | DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### memos

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| title | VARCHAR | NOT NULL | DEFAULT '' |
| content | JSONB | NULL | TipTap 포맷 |
| content_text | TEXT | NULL | 검색용 plain text |
| is_pinned | BOOLEAN | NOT NULL | DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### podcast_episodes

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| title | VARCHAR | NOT NULL | |
| description | TEXT | NULL | |
| audio_url | TEXT | NOT NULL | R2 URL |
| duration | INTEGER | NULL | seconds |
| source_urls | TEXT[] | NULL | |
| source_type | VARCHAR | NULL | article/paper/youtube/mixed |
| published_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### push_subscriptions

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| endpoint | TEXT | NOT NULL | UNIQUE |
| p256dh | TEXT | NOT NULL | |
| auth | TEXT | NOT NULL | |
| is_active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

## 인덱스

| 테이블 | 인덱스 | 컬럼 |
|--------|--------|------|
| curation_items | idx_curation_items_published | published_at DESC |
| curation_items | idx_curation_items_category | category |
| todos | idx_todos_date | user_id, date |
| todos | idx_todos_reminder | reminder_at (WHERE reminder_sent = false) |
| calendar_events | idx_calendar_events_dates | start_date, end_date |
| memos | idx_memos_updated | user_id, updated_at DESC |
| podcast_episodes | idx_podcast_published | user_id, published_at DESC |
