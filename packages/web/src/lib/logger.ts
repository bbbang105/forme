/**
 * 🔍 Structured Logger with Performance Tracing
 *
 * API 라우트와 서버 액션에서 사용하는 구조화된 로거.
 * 요청 처리 시간, 입력 파라미터, 에러를 추적합니다.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_EMOJI: Record<LogLevel, string> = {
  debug: '🔍',
  info: '✅',
  warn: '⚠️',
  error: '❌',
};

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function log(level: LogLevel, label: string, message: string, meta?: Record<string, unknown>) {
  const emoji = LEVEL_EMOJI[level];
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`${emoji} [${timestamp}] [${label}] ${message}${metaStr}`);
}

// ─── API Route Wrapper ───────────────────────────────────────────────

type RouteHandler = (req: Request, ctx?: unknown) => Promise<Response>;

/**
 * API 라우트 핸들러를 래핑하여 자동으로 타이밍/로깅을 추가합니다.
 *
 * @example
 * export const GET = withTracing('GET /api/feed', async (req) => {
 *   // ... handler logic
 * });
 */
export function withTracing(label: string, handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx?: unknown) => {
    const start = performance.now();
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());

    log('info', label, '📥 Request received', {
      method: req.method,
      path: url.pathname,
      ...(Object.keys(params).length > 0 ? { params } : {}),
    });

    try {
      const response = await handler(req, ctx);
      const duration = performance.now() - start;
      const durationStr = formatDuration(duration);

      const slow = duration > 1000;
      const emoji = slow ? '🐢' : '⚡';

      log(slow ? 'warn' : 'info', label, `${emoji} ${response.status} completed in ${durationStr}`, {
        status: response.status,
        durationMs: Math.round(duration),
        ...(slow ? { slow: true } : {}),
      });

      return response;
    } catch (err) {
      const duration = performance.now() - start;
      log('error', label, `💥 Failed after ${formatDuration(duration)}`, {
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(duration),
      });
      throw err;
    }
  };
}

// ─── Server Action Tracer ────────────────────────────────────────────

/**
 * 서버 액션의 실행 시간을 측정합니다.
 *
 * @example
 * const { result, duration } = await traceAction('getMemos', async () => {
 *   return db.select()...
 * });
 */
export async function traceAction<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;
    const durationStr = formatDuration(duration);

    const slow = duration > 500;
    const emoji = slow ? '🐢' : '⚡';

    log(slow ? 'warn' : 'debug', `action:${label}`, `${emoji} completed in ${durationStr}`, {
      durationMs: Math.round(duration),
      ...meta,
      ...(slow ? { slow: true } : {}),
    });

    return result;
  } catch (err) {
    const duration = performance.now() - start;
    log('error', `action:${label}`, `💥 Failed after ${formatDuration(duration)}`, {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(duration),
      ...meta,
    });
    throw err;
  }
}

// ─── DB Query Tracer ─────────────────────────────────────────────────

/**
 * DB 쿼리 실행 시간을 측정합니다.
 *
 * @example
 * const rows = await traceQuery('memos.list', () =>
 *   db.select().from(memos).where(eq(memos.userId, user.id))
 * );
 */
export async function traceQuery<T>(
  queryName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;
    const durationStr = formatDuration(duration);

    const slow = duration > 200;
    const emoji = slow ? '🐢' : '🗄️';

    log(slow ? 'warn' : 'debug', `db:${queryName}`, `${emoji} ${durationStr}`, {
      durationMs: Math.round(duration),
      ...(slow ? { slow: true } : {}),
    });

    return result;
  } catch (err) {
    const duration = performance.now() - start;
    log('error', `db:${queryName}`, `💥 Query failed after ${formatDuration(duration)}`, {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(duration),
    });
    throw err;
  }
}

export { log };
