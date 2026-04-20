'use client';

import {useMemo} from 'react';
import {ReactNodeViewRenderer} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import {ImageBlock} from './image-block';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {createLowlight} from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {CodeBlockView} from './code-block-view';
import {TaskListSort} from './task-list-sort';
import {CollapsibleHeading} from './collapsible-heading';
import {Extension} from '@tiptap/core';
import {createImageDropPlugin} from './image-drop-plugin';
import type {Extensions} from '@tiptap/core';

// Build the lowlight instance once at module scope — it is stateless and
// safe to share across editor instances.
const lowlight = createLowlight();
lowlight.register('javascript', javascript);
lowlight.register('js', javascript);
lowlight.register('typescript', typescript);
lowlight.register('ts', typescript);
lowlight.register('python', python);
lowlight.register('css', css);
lowlight.register('html', html);
lowlight.register('xml', html);
lowlight.register('json', json);
lowlight.register('bash', bash);
lowlight.register('shell', bash);
lowlight.register('sql', sql);
lowlight.register('markdown', markdown);
lowlight.register('yaml', yaml);
lowlight.register('java', java);
lowlight.register('go', go);

/**
 * Returns the TipTap extension list for NoteEditor.
 * Memoized so the array reference is stable across re-renders, preventing
 * the editor from reinitializing on every parent render.
 */
export function useEditorConfig(): Extensions {
  return useMemo<Extensions>((): Extensions => [
    StarterKit.configure({
      heading: false,    // replaced by CollapsibleHeading
      link: false,       // configured separately below
      underline: false,  // configured separately below
      codeBlock: false,  // replaced by CodeBlockLowlight
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
      addKeyboardShortcuts() {
        return {
          ...this.parent?.(),
          // Cmd/Ctrl+A: select only within code block
          'Mod-a': ({editor}) => {
            const {$from} = editor.state.selection;
            const codeBlock = $from.node($from.depth);
            if (codeBlock?.type.name === 'codeBlock') {
              const start = $from.start($from.depth);
              const end = start + codeBlock.content.size;
              editor.commands.setTextSelection({from: start, to: end});
              return true;
            }
            return false;
          },
          // Enter on empty last line or Mod+Enter -> exit code block
          Enter: ({editor}) => {
            const {$from} = editor.state.selection;
            if ($from.parent.type.name !== 'codeBlock') return false;
            const text = $from.parent.textContent;
            const lines = text.split('\n');
            const isAtEnd = $from.parentOffset === text.length;
            if (isAtEnd && lines.length >= 3 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
              const start = $from.start($from.depth);
              const trimmed = lines.slice(0, -2).join('\n');
              editor.chain()
                .command(({tr}) => {
                  tr.replaceWith(start, start + text.length, editor.state.schema.text(trimmed || ' '));
                  return true;
                })
                .exitCode()
                .run();
              return true;
            }
            return false;
          },
          'Mod-Enter': ({editor}) => {
            const {$from} = editor.state.selection;
            if ($from.parent.type.name !== 'codeBlock') return false;
            return editor.commands.exitCode();
          },
          // ArrowDown at last line -> exit
          ArrowDown: ({editor}) => {
            const {$from, empty} = editor.state.selection;
            if (!empty || $from.parent.type.name !== 'codeBlock') return false;
            const text = $from.parent.textContent;
            const isAtEnd = $from.parentOffset === text.length;
            const lastNewline = text.lastIndexOf('\n');
            const isOnLastLine = $from.parentOffset > lastNewline;
            if (isAtEnd || isOnLastLine) {
              const after = $from.after($from.depth);
              if (after >= editor.state.doc.content.size) {
                return editor.commands.exitCode();
              }
            }
            return false;
          },
        };
      },
    }).configure({
      lowlight,
      defaultLanguage: null,
    }),
    UnderlineExt,
    TaskList,
    TaskItem.extend({
      addAttributes() {
        return {
          checked: {
            default: false,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-checked') === 'true',
            renderHTML: (attributes: Record<string, unknown>) => ({
              'data-checked': attributes.checked,
            }),
          },
          taskId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-task-id'),
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.taskId) return {};
              return {'data-task-id': attributes.taskId};
            },
          },
        };
      },
    }).configure({nested: true}),
    TaskListSort,
    LinkExt.configure({
      openOnClick: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: {
        class: 'text-primary underline',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    ImageBlock,
    CollapsibleHeading.configure({ levels: [1, 2, 3] }),
    Placeholder.configure({ placeholder: '내용을 입력하세요...' }),
    CharacterCount,
    Extension.create({
      name: 'imageDropUpload',
      addProseMirrorPlugins() {
        return [createImageDropPlugin()];
      },
    }),
  // Empty deps: extensions are constant — no runtime-configurable values
  ], []);
}
