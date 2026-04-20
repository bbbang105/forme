'use client';

import type {ReactNodeViewProps} from '@tiptap/react';
import {NodeViewContent, NodeViewWrapper} from '@tiptap/react';
import {useCallback} from 'react';

/** Curated language list for the selector UI — matches registered lowlight grammars */
const LANGUAGES = [
  {value: '', label: '자동'},
  {value: 'typescript', label: 'TypeScript'},
  {value: 'javascript', label: 'JavaScript'},
  {value: 'python', label: 'Python'},
  {value: 'java', label: 'Java'},
  {value: 'go', label: 'Go'},
  {value: 'sql', label: 'SQL'},
  {value: 'html', label: 'HTML'},
  {value: 'xml', label: 'XML'},
  {value: 'css', label: 'CSS'},
  {value: 'json', label: 'JSON'},
  {value: 'yaml', label: 'YAML'},
  {value: 'bash', label: 'Bash'},
  {value: 'shell', label: 'Shell'},
  {value: 'markdown', label: 'Markdown'},
] as const;

export function CodeBlockView({node, updateAttributes}: ReactNodeViewProps) {
  const language = (node.attrs.language as string) || '';

  const onLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({language: e.target.value});
    },
    [updateAttributes],
  );

  // Ctrl/Cmd+A: select only code block content
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.stopPropagation();
        // Let ProseMirror handle selection within the node
        // The default behavior in a NodeViewContent already scopes it
      }
    },
    [],
  );

  return (
    <NodeViewWrapper className="code-block-wrapper" onKeyDown={onKeyDown}>
      {/* Language selector */}
      <div className="code-block-header" contentEditable={false}>
        <select
          value={language}
          onChange={onLanguageChange}
          className="code-block-lang-select"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
      <pre>
        <NodeViewContent as={'code' as 'div'} className={language ? `language-${language}` : ''} />
      </pre>
    </NodeViewWrapper>
  );
}
