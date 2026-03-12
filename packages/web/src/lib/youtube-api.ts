/**
 * YouTube Data API v3 유틸리티
 * - 영상 duration 조회 (쇼츠 필터용)
 * - 50개씩 배치 요청 (API 제한)
 */

import {YOUTUBE_VIDEO_ID_REGEX} from '@/lib/validators';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/** ISO 8601 duration (PT1H2M3S) → 초 변환 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

/**
 * 영상 ID 목록 → duration(초) 맵 반환
 * API 키가 없으면 빈 맵 반환 (필터링 스킵)
 */
export async function fetchVideoDurations(
  videoIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (!YOUTUBE_API_KEY || videoIds.length === 0) return result;

  // videoId 형식 검증 후 50개씩 배치 (API 최대)
  const safeIds = videoIds.filter((id) => YOUTUBE_VIDEO_ID_REGEX.test(id));
  if (safeIds.length === 0) return result;

  for (let i = 0; i < safeIds.length; i += 50) {
    const batch = safeIds.slice(i, i + 50);
    const ids = batch.join(',');

    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!res.ok) {
        console.error(`[youtube-api] videos.list failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const item of data.items ?? []) {
        const duration = parseDuration(item.contentDetails?.duration ?? '');
        result.set(item.id, duration);
      }
      console.log(`[youtube-api] Fetched durations for ${batch.length} videos, got ${(data.items ?? []).length} results`);
    } catch (e) {
      console.error('[youtube-api] fetchVideoDurations error:', e);
    }
  }

  return result;
}
