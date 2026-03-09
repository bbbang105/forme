# 팟캐스트 자동화 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 큐레이션 글을 기반으로 매일 07:00 KST에 2인 대화형 한국어 팟캐스트를 자동 생성 (전부 무료)

**Architecture:** GitHub Actions에서 매일 스케줄 실행 → Supabase에서 큐레이션 URL 조회 → Podcastfy(Gemini+Edge TTS)로 음성 생성 → R2 업로드 → DB 등록 → Discord 알림

**Tech Stack:** Podcastfy, Gemini API (무료), Edge TTS (무료), GitHub Actions, Cloudflare R2, Supabase

**Design doc:** `docs/plans/26-03-09-podcast-automation-design.md`

---

### Task 1: Vercel Cron 시간 변경

큐레이션 크롤 시간을 05:00 KST로 앞당겨서 팟캐스트 생성 전에 수집 완료되도록 한다.

**Files:**
- Modify: `vercel.json`

**Step 1: cron 시간 변경**

```json
{
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/curation",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/cron/calendar-daily",
      "schedule": "0 23 * * *"
    }
  ]
}
```

변경: `"0 22 * * *"` → `"0 20 * * *"` (UTC 20:00 = KST 05:00)

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: 큐레이션 cron을 05:00 KST로 변경 (팟캐스트 자동화 대비)"
```

---

### Task 2: Python 의존성 파일 생성

**Files:**
- Create: `scripts/requirements.txt`

**Step 1: requirements.txt 작성**

```txt
podcastfy>=0.3.0
edge-tts>=6.1.0
supabase>=2.0.0
boto3>=1.34.0
```

**Step 2: Commit**

```bash
git add scripts/requirements.txt
git commit -m "chore: 팟캐스트 자동화 Python 의존성 추가"
```

---

### Task 3: Podcastfy 대화 설정 파일 생성

**Files:**
- Create: `scripts/podcast-config.yaml`

**Step 1: 설정 파일 작성**

```yaml
podcast_name: "forme 데일리 브리핑"
podcast_tagline: "오늘의 큐레이션을 대화로 만나보세요"
output_language: "Korean"

conversation_style:
  - engaging
  - informative
  - casual

roles_person1: "진행자"
roles_person2: "해설자"

dialogue_structure:
  - "인트로: 오늘의 주제 간략 소개"
  - "기사별 핵심 요약과 토론"
  - "아웃트로: 오늘의 정리와 마무리 인사"

engagement_techniques:
  - "rhetorical questions"
  - "analogies"
  - "real-world examples"

creativity: 0.7
word_count: 2000
max_num_chunks: 8
min_chunk_size: 600

user_instructions: >
  한국어로 자연스러운 대화를 생성해주세요.
  두 사람이 편안하게 대화하는 팟캐스트 느낌으로.
  각 기사의 핵심 내용을 요약하고 왜 중요한지 설명해주세요.
  전문 용어는 쉽게 풀어서 설명하세요.
  10~15분 분량이 되도록 충분히 깊이 있게 다뤄주세요.

text_to_speech:
  default_tts_model: "edge"
  output_directories:
    transcripts: "./data/transcripts"
    audio: "./data/audio"
  audio_format: "mp3"
  temp_audio_dir: "data/audio/tmp/"
  ending_message: "오늘의 브리핑은 여기까지! 내일 또 만나요."
  edge:
    default_voices:
      question: "ko-KR-SunHiNeural"
      answer: "ko-KR-HyunsuNeural"
```

**Step 2: Commit**

```bash
git add scripts/podcast-config.yaml
git commit -m "feat: Podcastfy 한국어 대화 설정 추가"
```

---

### Task 4: 메인 생성 스크립트 작성

**Files:**
- Create: `scripts/generate-podcast.py`

**Step 1: 스크립트 작성**

핵심 흐름:
1. 환경변수 검증
2. Supabase에서 최근 24h 큐레이션 URL 조회
3. 0개면 스킵 + Discord 알림
4. Podcastfy로 팟캐스트 생성
5. R2에 오디오 업로드
6. Supabase에 에피소드 레코드 삽입
7. Discord 성공/실패 알림

```python
#!/usr/bin/env python3
"""forme 데일리 팟캐스트 자동 생성 스크립트.

큐레이션에서 수집된 글을 기반으로 Podcastfy(Gemini + Edge TTS)를 이용해
2인 대화형 한국어 팟캐스트를 생성하고 R2에 업로드한다.
"""

import json
import os
import sys
import uuid
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import yaml
from supabase import create_client

# ── 상수 ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))
MAX_URLS = 15  # Gemini 무료 티어 토큰 한도 고려
RETRY_COUNT = 1

# ── 환경변수 ──────────────────────────────────────────
REQUIRED_ENV = [
    "GEMINI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "CRON_USER_ID",
]


def check_env():
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")


# ── Discord 알림 ──────────────────────────────────────
def send_discord(content: str):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print("[discord] DISCORD_WEBHOOK_URL not set, skipping")
        return
    import urllib.request

    data = json.dumps({"content": content}).encode()
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[discord] Failed to send: {e}")


def today_str():
    return datetime.now(KST).strftime("%Y-%m-%d")


# ── Supabase 큐레이션 조회 ────────────────────────────
def fetch_recent_urls() -> list[dict]:
    """최근 24시간 수집된 큐레이션 아이템의 URL과 제목을 가져온다."""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    user_id = os.environ["CRON_USER_ID"]
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    # curation_items를 source_id로 조인하여 user 소유 확인
    resp = (
        sb.from_("curation_items")
        .select("id, title, url, description, category, source_id, curation_sources!inner(user_id)")
        .gte("collected_at", since)
        .eq("curation_sources.user_id", user_id)
        .order("collected_at", desc=True)
        .limit(MAX_URLS)
        .execute()
    )
    return resp.data or []


# ── Podcastfy 팟캐스트 생성 ───────────────────────────
def generate_audio(urls: list[str]) -> str:
    """Podcastfy로 팟캐스트 음성을 생성하고 파일 경로를 반환한다."""
    from podcastfy.client import generate_podcast

    config_path = Path(__file__).parent / "podcast-config.yaml"
    with open(config_path) as f:
        conversation_config = yaml.safe_load(f)

    audio_file = generate_podcast(
        urls=urls,
        tts_model="edge",
        llm_model_name="gemini-2.0-flash",
        conversation_config=conversation_config,
    )

    if not audio_file or not Path(audio_file).exists():
        raise RuntimeError("Podcastfy did not produce an audio file")

    return audio_file


# ── R2 업로드 ─────────────────────────────────────────
def upload_to_r2(local_path: str, user_id: str) -> tuple[str, int]:
    """오디오 파일을 R2에 업로드하고 (public_url, file_size)를 반환한다."""
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = os.environ["R2_BUCKET_NAME"]
    ext = Path(local_path).suffix or ".mp3"
    key = f"podcast/{user_id}/{uuid.uuid4()}{ext}"
    file_size = Path(local_path).stat().st_size

    s3.upload_file(
        local_path,
        bucket,
        key,
        ExtraArgs={
            "ContentType": "audio/mpeg",
            "CacheControl": "public, max-age=2592000, immutable",
        },
    )

    public_url = f"{os.environ.get('R2_PUBLIC_URL', '').rstrip('/')}/{key}"
    return public_url, file_size


# ── Supabase 에피소드 등록 ────────────────────────────
def insert_episode(title: str, description: str, audio_url: str, file_size: int, duration: int | None):
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    sb.table("podcast_episodes").insert({
        "user_id": os.environ["CRON_USER_ID"],
        "title": title,
        "description": description,
        "audio_url": audio_url,
        "file_size": file_size,
        "duration": duration,
    }).execute()


# ── 오디오 길이 측정 ──────────────────────────────────
def get_audio_duration(path: str) -> int | None:
    """mutagen으로 오디오 길이(초)를 측정. 실패 시 None."""
    try:
        from mutagen.mp3 import MP3
        audio = MP3(path)
        return int(audio.info.length)
    except Exception:
        return None


# ── 메인 ──────────────────────────────────────────────
def main():
    check_env()
    date = today_str()

    # 1. 큐레이션 URL 조회
    items = fetch_recent_urls()
    if not items:
        msg = f"⏭️ 데일리 팟캐스트 스킵\n📅 {date} — 새 글 없음"
        print(msg)
        send_discord(msg)
        return

    urls = [item["url"] for item in items]
    titles = [item["title"] for item in items]
    print(f"[main] {len(urls)}개 기사 수집됨")

    # 2. 팟캐스트 생성 (재시도 포함)
    audio_file = None
    last_error = None
    for attempt in range(RETRY_COUNT + 1):
        try:
            audio_file = generate_audio(urls)
            break
        except Exception as e:
            last_error = e
            print(f"[main] Attempt {attempt + 1} failed: {e}")

    if not audio_file:
        msg = f"❌ 데일리 팟캐스트 생성 실패\n📅 {date}\n💥 {last_error}"
        print(msg)
        send_discord(msg)
        sys.exit(1)

    # 3. 오디오 길이 측정
    duration = get_audio_duration(audio_file)
    duration_str = f"{duration // 60}분 {duration % 60}초" if duration else "측정 불가"

    # 4. R2 업로드
    user_id = os.environ["CRON_USER_ID"]
    audio_url, file_size = upload_to_r2(audio_file, user_id)

    # 5. DB 등록
    ep_title = f"{date} 데일리 브리핑 ({len(urls)}개 기사)"
    description = "오늘의 큐레이션:\n" + "\n".join(f"• {t}" for t in titles[:10])
    insert_episode(ep_title, description, audio_url, file_size, duration)

    # 6. Discord 성공 알림
    msg = (
        f"✅ 데일리 팟캐스트 생성 완료\n"
        f"📅 {ep_title}\n"
        f"⏱️ {duration_str}\n"
        f"📦 {file_size / 1024 / 1024:.1f}MB"
    )
    print(msg)
    send_discord(msg)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        msg = f"❌ 데일리 팟캐스트 생성 실패\n📅 {today_str()}\n💥 {traceback.format_exc()[-500:]}"
        send_discord(msg)
        raise
```

**Step 2: requirements.txt에 mutagen 추가** (오디오 길이 측정용)

```txt
podcastfy>=0.3.0
edge-tts>=6.1.0
supabase>=2.0.0
boto3>=1.34.0
mutagen>=1.47.0
```

**Step 3: Commit**

```bash
git add scripts/generate-podcast.py scripts/requirements.txt
git commit -m "feat: 데일리 팟캐스트 자동 생성 스크립트"
```

---

### Task 5: GitHub Actions 워크플로우 작성

**Files:**
- Create: `.github/workflows/podcast-generate.yml`

**Step 1: 워크플로우 작성**

```yaml
name: Generate Daily Podcast

on:
  schedule:
    - cron: '0 22 * * *' # UTC 22:00 = KST 07:00
  workflow_dispatch: {} # 수동 트리거

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: scripts/requirements.txt

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Generate podcast
        run: python scripts/generate-podcast.py
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          R2_PUBLIC_URL: ${{ secrets.R2_PUBLIC_URL }}
          CRON_USER_ID: ${{ secrets.CRON_USER_ID }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

**Step 2: Commit**

```bash
git add .github/workflows/podcast-generate.yml
git commit -m "feat: GitHub Actions 팟캐스트 자동 생성 워크플로우"
```

---

### Task 6: 로컬 테스트 (수동 실행)

**Step 1: Python 환경 세팅 및 테스트**

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Step 2: 환경변수 세팅 후 수동 실행**

```bash
export GEMINI_API_KEY="..."
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_BUCKET_NAME="..."
export R2_PUBLIC_URL="..."
export CRON_USER_ID="..."
export DISCORD_WEBHOOK_URL="..."

python generate-podcast.py
```

Expected: 오디오 파일 생성 → R2 업로드 → DB 등록 → Discord 알림

**Step 3: 앱에서 팟캐스트 목록 확인**

forme 앱 → 팟캐스트 탭에서 자동 생성된 에피소드가 보이는지 확인.

---

### Task 7: GitHub Secrets 설정 + workflow_dispatch 테스트

**Step 1: GitHub 리포에 시크릿 등록**

Settings → Secrets and variables → Actions에서 추가:
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `CRON_USER_ID`
- `DISCORD_WEBHOOK_URL`

**Step 2: 수동 트리거로 워크플로우 테스트**

```bash
gh workflow run podcast-generate.yml
gh run list --workflow=podcast-generate.yml --limit 1
```

**Step 3: 결과 확인**

- Discord 웹훅 알림 수신 확인
- 팟캐스트 탭에서 에피소드 확인
- 재생 테스트

---

### Task 8: 최종 커밋 + CLAUDE.md 업데이트

**Step 1: CLAUDE.md에 팟캐스트 자동화 관련 내용 추가**

`CLAUDE.md`의 핵심 파일 테이블에 추가:

```markdown
| `scripts/generate-podcast.py` | 데일리 팟캐스트 자동 생성 (Podcastfy + Gemini + Edge TTS) |
| `scripts/podcast-config.yaml` | Podcastfy 한국어 2인 대화 설정 |
| `.github/workflows/podcast-generate.yml` | GitHub Actions 팟캐스트 스케줄 (KST 07:00) |
```

코딩 컨벤션에 추가:

```markdown
- 팟캐스트 자동화: GitHub Actions (KST 07:00) → Podcastfy(Gemini+Edge TTS) → R2 업로드 → DB 등록, Discord 웹훅 알림 (성공/실패/스킵)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md에 팟캐스트 자동화 정보 추가"
```
