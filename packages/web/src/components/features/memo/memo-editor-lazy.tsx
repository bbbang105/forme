'use client';

import dynamic from 'next/dynamic';

const MemoEditor = dynamic(
  () => import('./memo-editor').then((m) => m.MemoEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 p-4 h-screen">
        <div className="animate-pulse bg-muted rounded-lg h-10 w-full" />
        <div className="animate-pulse bg-muted rounded-lg flex-1" />
      </div>
    ),
  }
);

export { MemoEditor as MemoEditorLazy };
