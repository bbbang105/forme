'use client';

import dynamic from 'next/dynamic';

const MarkdownRenderer = dynamic(
  () =>
    import('@/components/features/video/markdown-renderer').then(
      (m) => m.MarkdownRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-3 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 rounded bg-muted" />
        ))}
      </div>
    ),
  },
);

export function MarkdownRendererLazy({ content }: { content: string }) {
  return <MarkdownRenderer content={content} />;
}
