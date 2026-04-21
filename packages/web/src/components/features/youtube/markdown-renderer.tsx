'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div
      className={[
        'prose prose-sm max-w-none dark:prose-invert',
        // Body
        'prose-p:text-foreground/85 prose-p:leading-relaxed',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-em:text-foreground/90',
        // Headings — editorial display serif
        'prose-headings:text-foreground prose-headings:font-display prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-3',
        'prose-h2:text-xl prose-h2:mt-7 prose-h2:mb-2.5',
        'prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2',
        // Links — ember underline
        'prose-a:text-primary prose-a:no-underline prose-a:border-b prose-a:border-primary/40 hover:prose-a:border-primary',
        // Lists
        'prose-li:text-foreground/85 prose-li:my-0.5',
        'prose-ul:my-3 prose-ol:my-3',
        // Inline code — hairline chip
        'prose-code:rounded-sm prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
        // Code block
        'prose-pre:rounded-sm prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:text-[13px]',
        // Blockquote — editorial pull quote
        'prose-blockquote:border-l-2 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-foreground/75 prose-blockquote:font-display prose-blockquote:text-[1.05em]',
        // Table — hairline editorial
        'prose-table:text-sm prose-thead:border-border prose-tr:border-border',
        'prose-th:font-mono prose-th:text-[11px] prose-th:uppercase prose-th:tracking-[0.1em] prose-th:text-muted-foreground',
        // HR — hairline em-dash feel
        'prose-hr:border-border',
      ].join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false }]]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
