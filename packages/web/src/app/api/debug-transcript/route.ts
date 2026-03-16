import {NextResponse} from 'next/server';

export async function GET() {
  const videoId = 'gdg4DBcakIg';
  const results: Record<string, unknown> = {};

  try {
    // Step 1: YouTube 페이지 fetch
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+1',
      },
      signal: AbortSignal.timeout(10_000),
    });

    results.pageStatus = pageRes.status;
    const html = await pageRes.text();
    results.htmlLength = html.length;
    results.hasConsent = html.includes('consent.youtube.com');
    results.hasInitialPlayer = html.includes('ytInitialPlayerResponse');

    // Step 2: ytInitialPlayerResponse 파싱
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
    results.playerMatchFound = !!playerMatch;

    if (playerMatch) {
      try {
        const data = JSON.parse(playerMatch[1]!);
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        results.playabilityStatus = data?.playabilityStatus?.status;
        results.captionTracksCount = tracks?.length ?? 0;
        if (tracks?.length > 0) {
          results.languages = tracks.map((t: {languageCode: string}) => t.languageCode);
          results.firstTrackUrl = tracks[0].baseUrl?.slice(0, 100);
        }
      } catch (e) {
        results.parseError = (e as Error).message;
      }
    } else {
      // 페이지 내용 일부 캡처 (디버깅용)
      results.htmlSnippet = html.slice(0, 500);
    }
  } catch (e) {
    results.fetchError = (e as Error).message;
  }

  return NextResponse.json(results);
}
