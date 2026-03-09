# 팟캐스트 자동화 설계

## 개요

큐레이션에서 수집된 글을 기반으로 매일 자동으로 2인 대화형 한국어 팟캐스트를 생성하여, 출근길에 들을 수 있도록 한다.

## 아키텍처

```
[Vercel Cron 05:00 KST] 큐레이션 RSS 수집
        ↓ (2시간 여유)
[GitHub Actions 07:00 KST]
  1. Supabase에서 최근 24h 수집 큐레이션 URL 조회
  2. Podcastfy에 URL 전달 → Gemini로 2인 대화 스크립트 생성
  3. Edge TTS로 한국어 음성 합성 (남녀 혼합)
  4. R2에 오디오 업로드
  5. Supabase에 에피소드 레코드 삽입
        ↓
[~07:30 완료] 출근길에 재생
```

## 기술 스택 (전부 무료)

| 역할 | 기술 | 비용 |
|------|------|------|
| 스크립트 LLM | Gemini API 무료 티어 (15 RPM, 100만 토큰/일) | $0 |
| TTS | Edge TTS (한국어 SunHi/InJoon) | $0 |
| 오케스트레이션 | Podcastfy (Python, 오픈소스) | $0 |
| 스케줄러 | GitHub Actions schedule (2,000분/월 무료) | $0 |
| 오디오 저장 | Cloudflare R2 (기존, 10GB 무료) | $0 |
| DB | Supabase (기존) | $0 |

## 소스 선택

- 매일 크롤된 새 글 전부 (최근 24시간)
- 새 글 0개 → 에피소드 생성 스킵
- 본문은 생성 시점에 Podcastfy가 URL 직접 크롤 (DB 스키마 변경 없음)

## 팟캐스트 형식

- 스타일: 2인 대화형 (Host + Guest)
- 언어: 한국어
- 길이: 10~15분
- 제목: `2026-03-09 데일리 브리핑 (5개 기사)`

## 새로 추가되는 파일

| 파일 | 역할 |
|------|------|
| `scripts/generate-podcast.py` | 메인 생성 스크립트 |
| `scripts/requirements.txt` | Python 의존성 (podcastfy, edge-tts, supabase, boto3) |
| `scripts/podcast-config.yaml` | Podcastfy 설정 (한국어, 2인, 대화 스타일) |
| `.github/workflows/podcast-generate.yml` | GitHub Actions 워크플로우 |

## 기존 코드 변경

| 파일 | 변경 |
|------|------|
| `vercel.json` (cron 설정) | 큐레이션 cron 시간 05:00 KST (UTC 20:00)로 변경 |

## GitHub Actions 워크플로우

```yaml
name: Generate Daily Podcast
on:
  schedule:
    - cron: '0 22 * * *'  # UTC 22:00 = KST 07:00
  workflow_dispatch: {}     # 수동 트리거

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      - run: python scripts/generate-podcast.py
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          CRON_USER_ID: ${{ secrets.CRON_USER_ID }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

## generate-podcast.py 흐름

```python
1. Supabase에서 최근 24h curation_items 조회 (collected_at >= now - 24h)
2. 글 0개면 exit(0)
3. URL 목록 추출 (최대 10~15개, 너무 많으면 Gemini 토큰 초과)
4. Podcastfy generate_podcast(urls=urls, config=config)
   - LLM: Gemini (대화 스크립트 생성)
   - TTS: Edge TTS (한국어 음성 합성)
5. 생성된 오디오 파일 → R2 업로드
6. Supabase podcast_episodes 테이블에 레코드 삽입
```

## Podcastfy 설정 (podcast-config.yaml)

```yaml
conversation_style:
  - engaging
  - informative
  - casual
roles_person1: 진행자
roles_person2: 전문가
dialogue_structure:
  - 인트로 (오늘의 주제 소개)
  - 기사별 토론 (핵심 요약 + 의견)
  - 아웃트로 (정리)
output_language: Korean
text_to_speech:
  model: edge
  default_voices:
    question: ko-KR-SunHiNeural   # 여성 (Host)
    answer: ko-KR-InJoonNeural     # 남성 (Guest)
```

## Discord 웹훅 알림

생성 결과를 Discord 채널로 알림 전송.

**성공 시:**
```
✅ 데일리 팟캐스트 생성 완료
📅 2026-03-09 데일리 브리핑 (5개 기사)
⏱️ 12분 34초
🔗 [듣기](https://forme.app/podcast)
```

**실패 시:**
```
❌ 데일리 팟캐스트 생성 실패
📅 2026-03-09
💥 Error: Gemini API rate limit exceeded
```

**스킵 시 (새 글 0개):**
```
⏭️ 데일리 팟캐스트 스킵
📅 2026-03-09 — 새 글 없음
```

**구현:** `scripts/generate-podcast.py` 내 `send_discord_notification()` 함수.
**시크릿:** `DISCORD_WEBHOOK_URL` (GitHub Actions secrets)

## 예외 처리

- 새 글 0개 → 스킵 + Discord 알림 (exit 0, Actions 성공)
- Gemini API 실패 → 1회 재시도 + 실패 시 Discord 알림
- TTS 실패 → Discord 알림 + 실패 처리
- R2 업로드 실패 → Discord 알림 + 실패 처리

## 큐레이션 Cron 시간 변경

- 현재: 시간 미지정 (매일 1회)
- 변경: 05:00 KST (UTC 20:00) → 07:00 팟캐스트 생성 전 수집 완료
