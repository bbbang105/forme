import {describe, expect, it, vi} from 'vitest';

import {createSseStream, encodeSseMessage} from '@/lib/sse';

const decoder = new TextDecoder();

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  let out = '';
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe('encodeSseMessage', () => {
  it('formats as event + data + double newline', () => {
    const bytes = encodeSseMessage('progress', {step: 1});
    const text = decoder.decode(bytes);
    expect(text).toBe('event: progress\ndata: {"step":1}\n\n');
  });

  it('serialises complex payloads via JSON.stringify', () => {
    const bytes = encodeSseMessage('complete', {
      arr: [1, 2],
      nested: {a: 'b'},
    });
    const text = decoder.decode(bytes);
    expect(text).toContain('event: complete\n');
    expect(text).toContain('data: {"arr":[1,2],"nested":{"a":"b"}}\n');
    expect(text.endsWith('\n\n')).toBe(true);
  });

  it('handles empty/null data', () => {
    expect(decoder.decode(encodeSseMessage('ping', null))).toBe(
      'event: ping\ndata: null\n\n',
    );
  });
});

describe('createSseStream', () => {
  it('emits events, closes, and sets SSE headers', async () => {
    const res = createSseStream(async (send, close) => {
      send('start', {total: 2});
      send('progress', {index: 0});
      send('done', null);
      close();
    });

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');

    const text = await readAll(res);
    expect(text).toContain('event: start\ndata: {"total":2}\n\n');
    expect(text).toContain('event: progress\ndata: {"index":0}\n\n');
    expect(text).toContain('event: done\ndata: null\n\n');
  });

  it('forwards handler errors to onError and still closes the stream', async () => {
    const onError = vi.fn();
    const boom = new Error('boom');
    const res = createSseStream(
      async () => {
        throw boom;
      },
      {onError},
    );

    const text = await readAll(res);
    // Handler threw before any send — stream body is empty but closed cleanly.
    expect(text).toBe('');
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('calls onCancel and aborts the handler signal when consumer cancels', async () => {
    const onCancel = vi.fn();
    let capturedSignal: AbortSignal | undefined;
    let resolveHandler!: () => void;
    const handlerDone = new Promise<void>((r) => {
      resolveHandler = r;
    });

    const res = createSseStream(
      async (send, _close, signal) => {
        capturedSignal = signal;
        send('start', {});
        // Hold the stream open until test cancels.
        await handlerDone;
      },
      {onCancel},
    );

    const reader = res.body!.getReader();
    // Consume one chunk to ensure the handler has started.
    await reader.read();
    await reader.cancel();

    // Let the awaiting handler resolve so its finally block runs.
    resolveHandler();

    // onCancel and abort should both fire synchronously after cancel().
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('merges custom headers with defaults', async () => {
    const res = createSseStream(
      async (_send, close) => {
        close();
      },
      {headers: {'X-Custom': 'yes'}},
    );
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('send is a no-op after close (idempotent)', async () => {
    const res = createSseStream(async (send, close) => {
      close();
      // Should not throw or enqueue.
      send('late', {foo: 'bar'});
    });
    const text = await readAll(res);
    expect(text).toBe('');
  });
});
