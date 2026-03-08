'use client';

import {useRef} from 'react';
import {usePullToRefresh} from '@/hooks/use-pull-to-refresh';

/** Inline refresh icon SVG to avoid lucide-react HMR module factory conflict in Turbopack */
function RefreshIcon({className}: {className?: string}) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

export function PullToRefresh({children}: {children: React.ReactNode}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {setIndicatorRef, setIconRef} = usePullToRefresh(containerRef);

  return (
    <>
      {/* Indicator - positioned above the content, revealed by translateY */}
      <div
        ref={setIndicatorRef}
        className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
        style={{
          top: `calc(env(safe-area-inset-top) + 3.5rem - 48px)`,
          opacity: 0,
        }}
      >
        <div
          data-circle
          className="flex items-center justify-center h-9 w-9 rounded-full bg-background shadow-md border border-border"
        >
          <div ref={setIconRef} className="h-4 w-4 text-muted-foreground">
            <RefreshIcon className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Content wrapper that translates down */}
      <div ref={containerRef}>
        {children}
      </div>
    </>
  );
}
