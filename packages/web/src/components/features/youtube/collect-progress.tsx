'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {CheckCircle2, Loader2, XCircle} from 'lucide-react';

interface CollectResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  newItemsAdded: number;
  error?: string;
}

interface CollectSummary {
  totalSources: number;
  totalNewItems: number;
  successCount: number;
  failCount: number;
}

interface CollectProgressProps {
  sourceIds: string[];
  period: '3d' | '7d' | '30d';
  onComplete: () => void;
  onClose: () => void;
}

type CollectState = 'connecting' | 'collecting' | 'complete' | 'error';

export function CollectProgress({ sourceIds, period, onComplete, onClose }: CollectProgressProps) {
  const [state, setState] = useState<CollectState>('connecting');
  const [totalSources, setTotalSources] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentName, setCurrentName] = useState('');
  const [results, setResults] = useState<CollectResult[]>([]);
  const [summary, setSummary] = useState<CollectSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case 'start':
          setTotalSources(data.totalSources as number);
          setState('collecting');
          break;
        case 'processing':
          setCurrentIndex(data.index as number);
          setCurrentName(data.sourceName as string);
          break;
        case 'progress':
          setResults((prev) => [...prev, data.result as CollectResult]);
          break;
        case 'complete':
          setSummary(data.summary as CollectSummary);
          setState('complete');
          onCompleteRef.current();
          break;
      }
    },
    [],
  );

  useEffect(() => {
    const abortController = new AbortController();
    let done = false;

    (async () => {
      try {
        const response = await fetch('/api/youtube/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceIds, period }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          setErrorMessage(`수집 실패: ${response.status}`);
          setState('error');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setErrorMessage('스트림을 읽을 수 없습니다.');
          setState('error');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const parsed = JSON.parse(line.slice(6));
                handleEvent(currentEvent, parsed);
              } catch {
                // skip malformed
              }
              currentEvent = '';
            }
          }
        }
        done = true;
      } catch {
        if (!abortController.signal.aborted) {
          setErrorMessage('수집 중 오류가 발생했습니다.');
          setState('error');
        }
      }
    })();

    return () => {
      if (!done) abortController.abort();
    };
  }, [sourceIds, period, handleEvent]);

  const progressPct = totalSources > 0 ? ((currentIndex + 1) / totalSources) * 100 : 0;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-card p-4" role="status" aria-live="polite">
      {/* Status header — mono eyebrow + serif headline */}
      <div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {state === 'connecting' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
              <span>connecting</span>
            </>
          )}
          {state === 'collecting' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
              <span>collecting — {currentIndex + 1}/{totalSources}</span>
            </>
          )}
          {state === 'complete' && summary && (
            <>
              <CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />
              <span>complete</span>
            </>
          )}
          {state === 'error' && (
            <>
              <XCircle className="h-3 w-3 text-destructive" aria-hidden="true" />
              <span>error</span>
            </>
          )}
        </div>
        {state === 'complete' && summary && (
          <p className="mt-1 font-display text-xl leading-tight">
            새 영상 <span className="text-primary">{summary.totalNewItems}</span>건
          </p>
        )}
        {state === 'error' && errorMessage && (
          <p className="mt-1 text-sm text-destructive">{errorMessage}</p>
        )}
      </div>

      {/* Progress bar — hairline */}
      {state === 'collecting' && totalSources > 0 && (
        <div className="w-full h-[2px] bg-border overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Current source */}
      {state === 'collecting' && currentName && (
        <p className="text-xs text-muted-foreground truncate italic">
          {currentName}
        </p>
      )}

      {/* Results list — mono em-dash */}
      {results.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto border-t border-border pt-2">
          {results.map((r) => (
            <div key={r.sourceId} className="flex items-center gap-2 text-xs py-0.5">
              {r.success ? (
                <CheckCircle2 className="h-3 w-3 text-success shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{r.sourceName}</span>
              {r.success ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground ml-auto shrink-0">
                  — +{r.newItemsAdded}
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-destructive ml-auto shrink-0 truncate max-w-[160px]">
                  — {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary — mono stats strip */}
      {state === 'complete' && summary && (
        <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.12em]">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>sources {summary.totalSources}</span>
            <span aria-hidden="true">—</span>
            <span className="text-success">ok {summary.successCount}</span>
            {summary.failCount > 0 && (
              <>
                <span aria-hidden="true">—</span>
                <span className="text-destructive">fail {summary.failCount}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Close */}
      {(state === 'complete' || state === 'error') && (
        <button
          type="button"
          onClick={onClose}
          className="w-full text-center font-mono text-[11px] uppercase tracking-[0.14em] text-primary hover:text-primary/80 transition-colors cursor-pointer pt-1"
        >
          close
        </button>
      )}
    </div>
  );
}
