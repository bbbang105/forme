# 캘린더/투두 푸시알림 + UX 개선 설계

## 1. 푸시 알림

### 1-1. 데일리 요약 (매일 아침 8시 KST)
- Cron: `0 23 * * *` (UTC) = KST 08:00
- API: `POST /api/cron/calendar-daily`
- 오늘 일정 수 + 미완료 투두 수 조회
- 둘 다 0이면 알림 스킵
- 알림: "오늘 일정 N개, 할 일 M개가 있어요" → 클릭 시 `/calendar`
- 인증: CRON_SECRET + timingSafeEqual (기존 패턴)

### 1-2. 일정 리마인더 (15분 간격)
- Cron: `*/15 * * * *` (UTC)
- API: `POST /api/cron/calendar-reminder`
- calendar_events에 `reminder_sent` 컬럼 추가 (boolean, default false)
- 매 실행: startTime이 현재~1시간15분 후 범위 + reminderSent=false 조회
- 알림: "1시간 후: {제목} ({시간})" → 클릭 시 `/calendar`
- 전송 후 reminderSent=true 마킹
- 종일 일정(startTime=null)은 스킵
- 반복 일정: 인스턴스 날짜 기준으로 판별

### 1-3. 알림 설정
- 종류별 토글 없음. 구독하면 전부 수신 (1인용 앱)

## 2. UX 개선

### 2-1. 투두 완료 애니메이션
- 체크 아이콘 바운스 (scale keyframe)
- 텍스트 strikethrough 애니메이션 + 딜레이 후 완료 영역 이동

### 2-2. 빈 상태 개선
- 투두/일정 빈 상태: 이모지 + 랜덤 격려 문구
- 예: "오늘은 자유의 날!", "할 일 없는 하루도 좋아요"

### 2-3. 캘린더 그리드 컬러 dot
- 날짜 숫자 아래에 이벤트 색상 dot (최대 3개)
- 이벤트 많은 날 한눈에 파악

### 2-4. 밀린 투두 칩
- 실시간 계산: todo.date < 오늘 && !isCompleted
- 캘린더 상단에 "밀린 할 일 N개" 칩 표시
- 클릭 → 밀린 투두 목록 펼침 (날짜 표시)
- "오늘로 이동" 버튼 → date를 오늘로 업데이트

## 3. DB 변경

| 테이블 | 변경 |
|--------|------|
| calendar_events | reminder_sent (boolean, default false) 컬럼 추가 |
| todos | 변경 없음 |

## 4. Vercel Cron 설정

```json
{
  "crons": [
    { "path": "/api/cron/curation", "schedule": "0 22 * * *" },
    { "path": "/api/cron/calendar-daily", "schedule": "0 23 * * *" },
    { "path": "/api/cron/calendar-reminder", "schedule": "*/15 * * * *" }
  ]
}
```
