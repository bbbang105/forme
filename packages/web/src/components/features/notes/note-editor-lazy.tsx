'use client';

import dynamic from 'next/dynamic';

const NoteEditor = dynamic(
  () => import('./note-editor').then((m) => m.NoteEditor),
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

export { NoteEditor as NoteEditorLazy };
