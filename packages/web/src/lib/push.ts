import webpush from 'web-push';
import {db, pushSubscriptions} from '@forme/shared';
import {and, eq, inArray} from 'drizzle-orm';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@forme.app';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID 키가 설정되지 않았습니다');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
}

const PERMANENT_FAILURE_CODES = new Set([404, 410]);

function getStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as Record<string, unknown>).statusCode;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

/**
 * 특정 유저에게 푸시 알림 전송
 */
export async function sendPushToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number }> {
  ensureVapid();

  const subscriptions = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true),
      )
    );

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // URL은 반드시 상대 경로만 허용 (SW에서도 same-origin 검증함)
  const url = payload.url || '/';
  if (!url.startsWith('/')) {
    throw new Error('Push notification URL must be a relative path');
  }

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || 'forme',
    url,
    requireInteraction: payload.requireInteraction || false,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadStr,
      ),
    ),
  );

  // 영구 실패(404, 410)한 구독 비활성화
  const permanentFailEndpoints: string[] = [];
  let failed = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === 'rejected') {
      failed++;
      const statusCode = getStatusCode(result.reason);
      if (statusCode && PERMANENT_FAILURE_CODES.has(statusCode)) {
        permanentFailEndpoints.push(subscriptions[i]!.endpoint);
      }
    }
  }

  if (permanentFailEndpoints.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, permanentFailEndpoints));
  }

  return {
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed,
  };
}
