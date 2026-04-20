'use client';

import {useEffect} from 'react';
import {Calendar} from 'lucide-react';

export default function CalendarError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {
    console.error('[calendar]', error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center max-w-md mx-auto">
      <Calendar className="h-6 w-6 text-destructive mb-5" aria-hidden="true" />
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
        <span className="text-primary" aria-hidden="true">—</span> Something&apos;s off
      </p>
      <h2 className="font-display text-2xl leading-snug text-foreground mb-4">
        캘린더를 불러올 수 없습니다.
      </h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        일시적인 오류가 발생했습니다.
      </p>
      <button
        type="button"
        onClick={reset}
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary hover:text-primary/80 transition-colors cursor-pointer"
      >
        — Try again
      </button>
    </div>
  );
}
