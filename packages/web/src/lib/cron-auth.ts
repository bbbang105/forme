import {timingSafeEqual} from 'node:crypto';
import {UUID_REGEX} from '@/lib/validators';
import {db, profiles} from '@forme/shared';

/** Minimum recommended CRON_SECRET length (in characters). */
export const MIN_CRON_SECRET_LENGTH = 32;

/** One-shot warning so we don't spam logs on every request. */
let _weakSecretWarned = false;
function warnIfWeakSecret(secret: string | undefined): void {
  if (_weakSecretWarned) return;
  if (!secret) return;
  if (secret.length < MIN_CRON_SECRET_LENGTH) {
    _weakSecretWarned = true;
    // Log once at runtime. Short secrets weaken brute-force resistance but
    // shouldn't break serving — hence warn, not throw.
    console.warn(
      `[cron-auth] CRON_SECRET is shorter than ${MIN_CRON_SECRET_LENGTH} chars; please rotate to a 32+ char random value.`,
    );
  }
}

/** Internal helper for tests: reset the warn-once flag. Not exported from index. */
export function _resetWeakSecretWarning(): void {
  _weakSecretWarned = false;
}

/** Timing-safe string comparison — constant time regardless of length mismatch */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Consume constant time to prevent length-based timing leak
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify cron request authentication (secret only).
 * Returns all active user IDs for multi-user cron processing.
 */
export function verifyCronSecret(request: Request):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET?.trim();
  warnIfWeakSecret(secret);
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

/**
 * Legacy single-user cron auth (backward compatible).
 * Returns userId on success, or an error object on failure.
 */
export function verifyCronAuth(request: Request):
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string } {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET?.trim();
  warnIfWeakSecret(secret);
  if (!secret || !authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const userId = process.env.CRON_USER_ID?.trim();
  if (!userId || !UUID_REGEX.test(userId)) {
    return { ok: false, status: 500, error: 'Server misconfiguration' };
  }

  return { ok: true, userId };
}

/** Cached user IDs with 5-minute TTL */
let cachedUserIds: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Get all active user IDs from profiles table (capped at 100, cached 5min) */
export async function getAllUserIds(): Promise<string[]> {
  const now = Date.now();
  if (cachedUserIds && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedUserIds;
  }
  const rows = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .limit(100);
  cachedUserIds = rows.map((r) => r.userId);
  cacheTimestamp = now;
  return cachedUserIds;
}
