/**
 * Discord 웹훅 전송 유틸.
 * DISCORD_WEBHOOK_URL 환경변수가 없으면 조용히 스킵한다.
 * 모든 네트워크 에러를 내부에서 삼켜 호출자의 cron이 500을 반환하지 않도록 한다.
 */

const DISCORD_WEBHOOK_PATTERN = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

function getWebhookUrl(): string | null {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn('[discord] DISCORD_WEBHOOK_URL not set, skipping');
    return null;
  }
  if (!DISCORD_WEBHOOK_PATTERN.test(url)) {
    console.error('[discord] DISCORD_WEBHOOK_URL does not match expected pattern, skipping');
    return null;
  }
  return url;
}

export async function sendDiscordMessage(content: string): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[discord] webhook failed: ${res.status} ${res.statusText}`, body);
    }
  } catch (err) {
    console.error('[discord] fetch threw', err);
  }
}

/**
 * Discord embed 형식으로 전송 (긴 콘텐츠용).
 */
export async function sendDiscordEmbed(
  title: string,
  description: string,
  color?: number,
): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description: description.slice(0, 4096), // Discord embed desc limit
          color: color ?? 0x0ea5e9, // Sky Blue
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[discord] webhook failed: ${res.status} ${res.statusText}`, body);
    }
  } catch (err) {
    console.error('[discord] fetch threw', err);
  }
}
