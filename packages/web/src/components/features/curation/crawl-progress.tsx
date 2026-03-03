'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface CrawlResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  itemsFound: number;
  newItemsAdded: number;
  itemsFilteredOut: number;
  error?: string;
}

interface CrawlSummary {
  totalSources: number;
  totalNewItems: number;
  successCount: number;
  failCount: number;
}

interface CrawlProgressProps {
  since?: string;
  onComplete: () => void;
  onClose: () => void;
}

type CrawlState = 'connecting' | 'crawling' | 'complete' | 'error';

export function CrawlProgress({ since, onComplete, onClose }: CrawlProgressProps) {
  const [state, setState] = useState<CrawlState>('connecting');
  const [totalSources, setTotalSources] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentName, setCurrentName] = useState('');
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [summary, setSummary] = useState<CrawlSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Ref to avoid re-triggering useEffect when parent re-renders
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const handleEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case 'start':
          setTotalSources(data.totalSources as number);
          setState('crawling');
          break;
        case 'processing':
          setCurrentIndex(data.index as number);
          setCurrentName(data.sourceName as string);
          break;
        case 'progress':
          setResults((prev) => [...prev, data.result as CrawlResult]);
          break;
        case 'complete':
          setSummary(data.summary as CrawlSummary);
          setState('complete');
          onCompleteRef.current();
          break;
      }
    },
    []
  );

  useEffect(() => {
    const abortController = new AbortController();
    let done = false;

    (async () => {
      try {
        const response = await fetch('/api/curation/crawl', {
          method: 'POST',
          headers: since ? { 'Content-Type': 'application/json' } : undefined,
          body: since ? JSON.stringify({ since }) : undefined,
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
                const data = JSON.parse(line.slice(6));
                handleEvent(currentEvent, data);
              } catch {
                // skip malformed data
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
  }, [since, handleEvent]);

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {state === 'connecting' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">연결 중...</span>
          </>
        )}
        {state === 'crawling' && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">
              수집 중... ({currentIndex + 1}/{totalSources})
            </span>
          </>
        )}
        {state === 'complete' && summary && (
          <>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">
              수집 완료 — 새 아이템 {summary.totalNewItems}건
            </span>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">{errorMessage}</span>
          </>
        )}
      </div>

      {/* Progress bar */}
      {state === 'crawling' && totalSources > 0 && (
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalSources) * 100}%` }}
          />
        </div>
      )}

      {/* Current source */}
      {state === 'crawling' && currentName && (
        <p className="text-xs text-muted-foreground truncate">
          처리 중: {currentName}
        </p>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.sourceId}
              className="flex items-center gap-2 text-xs py-1"
            >
              {r.success ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              )}
              <span className="truncate">{r.sourceName}</span>
              {r.success ? (
                <span className="text-muted-foreground ml-auto shrink-0">
                  +{r.newItemsAdded}건
                  {r.itemsFilteredOut > 0 && (
                    <span className="text-muted-foreground/60"> ({r.itemsFilteredOut}건 제외)</span>
                  )}
                </span>
              ) : (
                <span className="text-destructive ml-auto shrink-0 truncate max-w-[120px]">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {state === 'complete' && summary && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-xs">
          <div className="flex items-center gap-4">
            <span>소스 {summary.totalSources}개</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              성공 {summary.successCount}
            </span>
            {summary.failCount > 0 && (
              <span className="text-destructive">실패 {summary.failCount}</span>
            )}
          </div>
          <span className="font-medium">
            새 아이템 {summary.totalNewItems}건
          </span>
        </div>
      )}

      {/* Close button */}
      {(state === 'complete' || state === 'error') && (
        <button
          onClick={onClose}
          className="w-full text-center text-sm text-primary hover:underline"
        >
          닫기
        </button>
      )}
    </div>
  );
}
