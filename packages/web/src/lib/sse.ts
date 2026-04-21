/**
 * Shared Server-Sent Events helpers.
 *
 * All of our SSE routes (`/api/feed/crawl`, `/api/youtube/collect`,
 * `/api/youtube/summarize`, `/api/youtube/add-url`) used to hand-roll the
 * same `event: X\ndata: JSON.stringify\n\n` encoding plus the
 * `controller.close()` lifecycle and `cancel()` handling. This module
 * consolidates the boilerplate so each route can focus on domain logic.
 */

const encoder = new TextEncoder();

/**
 * Encode a single SSE message as a Uint8Array ready to `controller.enqueue`.
 */
export function encodeSseMessage(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Sends a typed event to the client; safe to call after close (no-op). */
export type SseSend = (event: string, data: unknown) => void;

/** Closes the SSE stream; idempotent. */
export type SseClose = () => void;

/**
 * Caller-provided async worker that drives the stream.
 *
 * @param send    Emits an SSE message — no-ops if the stream already closed.
 * @param close   Idempotently closes the stream.
 * @param signal  Aborted when the client disconnects (SSE `cancel`). Pass to
 *                `fetch` etc. to cooperatively stop upstream work.
 */
export type SseHandler = (
  send: SseSend,
  close: SseClose,
  signal: AbortSignal,
) => Promise<void>;

/** Options for {@link createSseStream}. */
export interface CreateSseStreamOptions {
  /** Extra response headers merged into the SSE defaults. */
  headers?: HeadersInit;
  /**
   * Called if the handler throws. By default the error is logged to `console.error`.
   * The stream is always closed afterwards.
   */
  onError?: (err: unknown) => void;
  /**
   * Called when the client cancels the stream (SSE disconnect). Useful for
   * best-effort cleanup like rolling back in-flight DB rows.
   */
  onCancel?: () => void | Promise<void>;
}

/**
 * Build an SSE `Response` backed by a `ReadableStream`.
 *
 * The caller's `handler` receives:
 *  - `send` — fire SSE events (silently no-ops once the stream is closed)
 *  - `close` — end the stream (idempotent)
 *  - `signal` — aborted on client disconnect, for cooperative cancellation
 *
 * The stream is guaranteed to be closed when the handler settles.
 */
export function createSseStream(
  handler: SseHandler,
  options: CreateSseStreamOptions = {},
): Response {
  const {headers, onError, onCancel} = options;

  const abortController = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseSend = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSseMessage(event, data));
        } catch {
          closed = true;
        }
      };

      const close: SseClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      try {
        await handler(send, close, abortController.signal);
      } catch (err) {
        if (onError) {
          try {
            onError(err);
          } catch {
            /* swallow */
          }
        } else {
          console.error('[sse] handler error:', err);
        }
      } finally {
        close();
      }
    },
    async cancel() {
      closed = true;
      abortController.abort();
      if (onCancel) {
        try {
          await onCancel();
        } catch (err) {
          console.error('[sse] onCancel error:', err);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...headers,
    },
  });
}
