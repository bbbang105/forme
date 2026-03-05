# Dashboard Redesign - Gamification + Weather

## Overview

대시보드 전면 개선: 기능 바로가기 카드 제거, 서울 날씨 위젯 추가, 게이미피케이션(스트릭/미션) 도입.

## Layout (top → bottom)

1. **Hero**: 인사말 + 서울 날씨 (픽토그램, 현재/체감/최저/최고)
2. **오늘의 미션**: 출석 스트릭 + 4가지 데일리 챌린지 프로그레스
3. **오늘 할 일**: 캘린더 위젯 (기존 유지)
4. **읽을거리**: 큐레이션 위젯 (기존 유지)
5. **최근 메모**: 메모 위젯 (기존 유지)

## Weather Widget

- API: Open-Meteo (무료, API 키 불필요)
- Endpoint: `https://api.open-meteo.com/v1/forecast?latitude=37.57&longitude=126.98&current=temperature_2m,weather_code,apparent_temperature&daily=temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul&forecast_days=1`
- Server Component + `revalidate: 3600` (1시간 캐시)
- WMO weather code → 픽토그램 매핑

## Gamification

### Daily Missions

| Mission | Condition | Data Source |
|---------|-----------|-------------|
| 출석 | 앱 방문 | `user_daily_activity` 테이블 |
| 큐레이션 5개 읽기 | 당일 readAt 5회 | `curation_items.read_at` |
| 팟캐스트 10분 | 누적 10분 | `user_daily_activity.podcast_listen_seconds` |
| 투두 전체 완료 | 당일 100% | `todos` 테이블 계산 |

### Streak Rules

- KST 자정 기준 리셋
- 미달성 시 연속 기록 리셋
- 연속 일수는 쿼리 시 실시간 계산 (개인 앱, 데이터 적음)

## DB Schema Changes

### New Table: `user_daily_activity`

```sql
CREATE TABLE user_daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  logged_in BOOLEAN DEFAULT true,
  podcast_listen_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);
-- RLS: auth.uid() = user_id
```

### Alter: `curation_items`

```sql
ALTER TABLE curation_items ADD COLUMN read_at TIMESTAMPTZ;
```

## Podcast Listening Time Tracking

- PlayerContext: 30초마다 서버에 누적 시간 전송
- `POST /api/stats/listening-time` → UPSERT `user_daily_activity`
- Debounced to prevent excessive API calls

## File Structure

| File | Purpose |
|------|---------|
| `packages/shared/src/schema/user-daily-activity.ts` | Drizzle 스키마 |
| `packages/web/src/lib/weather.ts` | Open-Meteo API 유틸 |
| `packages/web/src/components/features/dashboard/weather-widget.tsx` | 날씨 위젯 (서버) |
| `packages/web/src/components/features/dashboard/daily-missions.tsx` | 미션 카드 (서버) |
| `packages/web/src/lib/actions/activity.ts` | 출석/스트릭 Server Actions |
| `packages/web/src/app/api/stats/listening-time/route.ts` | 팟캐스트 시간 API |
| `packages/web/src/app/(main)/dashboard/page.tsx` | 대시보드 페이지 (수정) |
