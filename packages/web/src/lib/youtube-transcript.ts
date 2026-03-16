import {isSafeUrl} from '@/lib/url-safety';
import {YOUTUBE_VIDEO_ID_REGEX} from '@/lib/validators';

const MAX_TRANSCRIPT_CHARS = 80_000;

export interface TranscriptResult {
  content: string;
  source: 'transcript' | 'description';
}

/**
 * YouTube 자막 추출 (innertube ANDROID client → timedtext XML 파싱)
 * Python youtube-transcript-api와 동일한 방식
 */
export async function fetchTranscript(
  videoId: string,
  description?: string | null,
): Promise<TranscriptResult> {
  try {
    const content = await fetchCaptionText(videoId);
    if (content && content.length > 30) {
      return { content: content.slice(0, MAX_TRANSCRIPT_CHARS), source: 'transcript' };
    }
    throw new Error('Empty transcript');
  } catch {
    // 자막 실패 → description 폴백
    if (description && description.trim().length > 50) {
      return { content: description.trim().slice(0, MAX_TRANSCRIPT_CHARS), source: 'description' };
    }
    throw new Error('자막을 가져올 수 없고, 영상 설명도 부족합니다');
  }
}

// 공개 innertube API key (WEB client) — 페이지 파싱 불필요
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

async function fetchCaptionText(videoId: string): Promise<string> {
  if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) throw new Error('Invalid video ID');

  // innertube player API 직접 호출 (WEB client + 브라우저 헤더 — 클라우드 IP 차단 우회)
  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!playerRes.ok) throw new Error(`Innertube player failed: ${playerRes.status}`);
  const playerData = await playerRes.json();

  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('No caption tracks');

  // 한국어 > 영어 > 첫 번째
  const track =
    tracks.find((t: { languageCode: string }) => t.languageCode === 'ko') ??
    tracks.find((t: { languageCode: string }) => t.languageCode === 'en') ??
    tracks[0];

  if (!track?.baseUrl) throw new Error('No valid caption URL');
  if (!isSafeUrl(track.baseUrl)) throw new Error('Unsafe caption URL');

  // Step 3: 자막 XML fetch + 파싱
  const captionRes = await fetch(track.baseUrl, { signal: AbortSignal.timeout(10_000) });
  if (!captionRes.ok) throw new Error(`Caption fetch failed: ${captionRes.status}`);
  const xml = await captionRes.text();

  return parseTimedTextXml(xml);
}

/** timedtext format="3" XML 파싱 — <p> 태그에서 <s> 세그먼트 텍스트 추출 */
function parseTimedTextXml(xml: string): string {
  const texts: string[] = [];

  // <p ...>내용</p> 블록 매칭
  const pRegex = /<p\s[^>]*>([\s\S]*?)<\/p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const inner = pMatch[1]!;

    // <s> 세그먼트가 있으면 그 안의 텍스트 추출
    if (inner.includes('<s')) {
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch;
      const words: string[] = [];
      while ((sMatch = sRegex.exec(inner)) !== null) {
        const decoded = decodeXmlEntities(sMatch[1]!);
        if (decoded) words.push(decoded);
      }
      if (words.length > 0) texts.push(words.join(''));
    } else {
      // <s> 없이 직접 텍스트
      const decoded = decodeXmlEntities(inner.replace(/<[^>]+>/g, ''));
      if (decoded) texts.push(decoded);
    }
  }

  // format="3"이 아닌 레거시 형식: <text ...>내용</text>
  if (texts.length === 0) {
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let tMatch;
    while ((tMatch = textRegex.exec(xml)) !== null) {
      const decoded = decodeXmlEntities(tMatch[1]!);
      if (decoded) texts.push(decoded);
    }
  }

  return texts.join(' ');
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, ' ')
    .trim();
}
