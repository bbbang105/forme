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
        const response = await fetch('/api/video/collect', {
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

  return (
    <div className="space-y-3 rounded-lg border border-border p-4" role="status" aria-live="polite">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {state === 'connecting' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">연결 중…</span>
          </>
        )}
        {state === 'collecting' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">
              수집 중… ({currentIndex + 1}/{totalSources})
            </span>
          </>
        )}
        {state === 'complete' && summary && (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            <span className="text-sm font-medium">
              수집 완료 — 새 영상 {summary.totalNewItems}건
            </span>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm font-medium text-destructive">{errorMessage}</span>
          </>
        )}
      </div>

      {/* Progress bar */}
      {state === 'collecting' && totalSources > 0 && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalSources) * 100}%` }}
          />
        </div>
      )}

      {/* Current source */}
      {state === 'collecting' && currentName && (
        <p className="text-xs text-muted-foreground truncate">
          처리 중: {currentName}
        </p>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {results.map((r) => (
            <div key={r.sourceId} className="flex items-center gap-2 text-xs py-0.5">
              {r.success ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{r.sourceName}</span>
              {r.success ? (
                <span className="text-muted-foreground ml-auto shrink-0">+{r.newItemsAdded}건</span>
              ) : (
                <span className="text-destructive ml-auto shrink-0">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {state === 'complete' && summary && (
        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
          <div className="flex items-center gap-3">
            <span>채널 {summary.totalSources}개</span>
            <span className="text-emerald-600 dark:text-emerald-400">성공 {summary.successCount}</span>
            {summary.failCount > 0 && (
              <span className="text-destructive">실패 {summary.failCount}</span>
            )}
          </div>
          <span className="font-medium">새 영상 {summary.totalNewItems}건</span>
        </div>
      )}

      {/* Close */}
      {(state === 'complete' || state === 'error') && (
        <button
          type="button"
          onClick={onClose}
          className="w-full text-center text-sm text-primary hover:underline cursor-pointer"
        >
          닫기
        </button>
      )}
    </div>
  );
}
