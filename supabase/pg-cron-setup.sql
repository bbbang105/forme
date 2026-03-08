-- ============================================================
-- Supabase pg_cron + pg_net: 캘린더 리마인더 15분 주기 호출
-- ============================================================
-- Vercel Hobby 플랜은 일 1회 Cron만 허용하므로,
-- Supabase pg_cron으로 15분 주기 리마인더를 실행한다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행
-- ============================================================

-- 1. 익스텐션 활성화 (Supabase에서 기본 제공)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. 15분마다 calendar-reminder API 호출
-- ⚠️ <YOUR_DOMAIN>과 <YOUR_CRON_SECRET>을 실제 값으로 교체
SELECT cron.schedule(
  'calendar-reminder-every-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<YOUR_DOMAIN>/api/cron/calendar-reminder',
    headers := '{"Authorization": "Bearer <YOUR_CRON_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- 관리 명령어 (필요 시 사용)
-- ============================================================

-- 등록된 잡 목록 확인
-- SELECT * FROM cron.job;

-- 잡 실행 기록 확인
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- 잡 삭제
-- SELECT cron.unschedule('calendar-reminder-every-15m');
