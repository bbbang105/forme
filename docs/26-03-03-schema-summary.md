# DB 스키마 요약

## 테이블 관계도

```
auth.users (Supabase 관리)
  └── profiles (1:1)
  └── curation_sources (1:N)
        └── curation_items (1:N)
  └── calendar_events (1:N)
  └── event_categories (1:N)
        └── calendar_events.category_id (FK, nullable)
  └── todos (1:N)
  └── memos (1:N)
  └── podcast_episodes (1:N)
  └── push_subscriptions (1:N)
  └── user_daily_activity (1:N)
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
| discord_id | VARCHAR(255) | NOT NULL | |
| discord_username | VARCHAR(255) | NOT NULL | |
| display_name | VARCHAR(255) | NULL | |
| avatar_url | TEXT | NULL | |
| interests | TEXT[] | NOT NULL | DEFAULT '{}', 추천 정렬용 |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### curation_sources

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| name | VARCHAR(200) | NOT NULL | |
| url | TEXT | NOT NULL | |
| rss_url | TEXT | NULL | |
| category | VARCHAR(50) | NOT NULL | DEFAULT 'ai' |
| tags | TEXT[] | NULL | 소스 기본 태그 |
| is_active | BOOLEAN | NOT NULL | DEFAULT true |
| is_favorite | BOOLEAN | NOT NULL | DEFAULT false |
| favorite_order | INTEGER | NOT NULL | DEFAULT 0, 즐겨찾기 정렬 순서 |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### curation_items

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| source_id | UUID | NOT NULL | FK → curation_sources (CASCADE) |
| title | VARCHAR(500) | NOT NULL | |
| url | TEXT | NOT NULL | |
| description | TEXT | NULL | |
| thumbnail_url | TEXT | NULL | og:image |
| published_at | TIMESTAMPTZ | NULL | |
| category | VARCHAR(50) | NOT NULL | |
| tags | TEXT[] | NULL | 피드 카테고리 + 소스 태그 머지 |
| is_read | BOOLEAN | NOT NULL | DEFAULT false |
| is_bookmarked | BOOLEAN | NOT NULL | DEFAULT false |
| collected_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| read_at | TIMESTAMPTZ | NULL | 읽음 처리 시각 (게이미피케이션 스트릭 계산용) |

### user_daily_activity

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | |
| date | DATE | NOT NULL | UNIQUE(user_id, date) |
| logged_in | BOOLEAN | NOT NULL | DEFAULT true, 출석 기록 |
| podcast_listen_seconds | INTEGER | NOT NULL | DEFAULT 0, 일일 누적 청취 시간 |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### calendar_events

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| title | VARCHAR | NOT NULL | |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| start_time | VARCHAR(5) | NULL | HH:MM |
| end_time | VARCHAR(5) | NULL | HH:MM |
| color | VARCHAR(20) | NOT NULL | DEFAULT '#3b82f6' |
| description | TEXT | NULL | |
| location | VARCHAR(200) | NULL | |
| category_id | UUID | NULL | FK → event_categories |
| is_completed | BOOLEAN | NOT NULL | DEFAULT false |
| reminder_sent | BOOLEAN | NOT NULL | DEFAULT false, Cron 리마인더 발송 여부 |
| recurrence_type | VARCHAR(10) | NULL | 'weekly' \| 'biweekly' |
| recurrence_days | INTEGER[] | NULL | [0=일, 1=월, ..., 6=토] |
| recurrence_end_date | DATE | NULL | 반복 종료일 |
| excluded_dates | DATE[] | NULL | 삭제된 날짜 목록 |
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
| title | VARCHAR(200) | NULL | |
| content | JSONB | NOT NULL | DEFAULT '{}', TipTap JSON 포맷 |
| content_text | TEXT | NOT NULL | DEFAULT '', 검색/미리보기용 plain text |
| is_pinned | BOOLEAN | NOT NULL | DEFAULT false |
| tags | TEXT[] | NULL | 최대 5개, 각 20자 이내 |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT NOW() |

### podcast_episodes

| 컬럼 | 타입 | Nullable | 비고 |
|------|------|----------|------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL | FK → auth.users |
| title | TEXT | NOT NULL | |
| description | TEXT | NULL | |
| audio_url | TEXT | NOT NULL | Cloudflare R2 URL |
| duration | INTEGER | NULL | seconds |
| file_size | BIGINT | NULL | bytes |
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
| curation_sources | idx_sources_user | user_id |
| curation_sources | idx_sources_user_fav_order | user_id, is_favorite, favorite_order |
| curation_items | idx_items_source_url | source_id, url (UNIQUE) |
| curation_items | idx_items_published | published_at |
| curation_items | idx_items_category | category |
| curation_items | idx_items_source | source_id |
| todos | idx_todos_date | user_id, date |
| todos | idx_todos_reminder | reminder_at (WHERE reminder_sent = false) |
| calendar_events | idx_calendar_events_user_dates | user_id, start_date, end_date |
| curation_items | idx_items_read_at | read_at |
| memos | idx_memos_list | user_id, is_pinned, updated_at |
| memos | idx_memos_search | user_id, content_text |
| podcast_episodes | idx_podcast_episodes_user_published | user_id, published_at |
| push_subscriptions | idx_push_subs_endpoint | endpoint (UNIQUE) |
| push_subscriptions | idx_push_subs_user | user_id |
| curation_items | idx_items_bookmarked | is_bookmarked (WHERE true) |
| user_daily_activity | idx_user_daily_activity_user_date | user_id, date (UNIQUE) |
