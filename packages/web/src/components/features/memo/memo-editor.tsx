'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {EditorContent, ReactNodeViewRenderer, useEditor} from '@tiptap/react';
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
import {ArrowLeft, Check, Pin, RotateCcw, Trash2} from 'lucide-react';
import {deleteMemo, toggleMemoPin, updateMemo} from '@/lib/actions/memos';
import {MemoToolbar} from './memo-toolbar';
import {TagInput} from './tag-input';
import {cn} from '@/lib/utils';
import {useAutoSave} from '@/hooks/use-auto-save';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

interface MemoEditorProps {
  memo: {
    id: string;
    title: string | null;
    content: unknown;
    isPinned: boolean;
    tags?: string[] | null;
  };
}

export function MemoEditor({ memo }: MemoEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(memo.title ?? '');
  const [isPinned, setIsPinned] = useState(memo.isPinned);
  const [tags, setTags] = useState<string[]>(memo.tags ?? []);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    extensions: [
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
              // Triple Enter: last 2 lines empty + currently at end
              if (isAtEnd && lines.length >= 3 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
                // Remove the trailing empty lines and exit
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
                // Check if this is the last node in the doc
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
    ],
    // Deep clone to strip ProseMirror null-prototype objects & RSC references
    content: (memo.content && typeof memo.content === 'object' && Object.keys(memo.content as Record<string, unknown>).length > 0)
      ? JSON.parse(JSON.stringify(memo.content))
      : undefined,
    immediatelyRender: false,
  });

  // Keep a ref to editor for use in saveFn callback
  editorRef.current = editor;

  const saveFn = useCallback(async (): Promise<boolean> => {
    const ed = editorRef.current;
    if (!ed) return true;
    // Deep clone to convert ProseMirror's null-prototype attrs to plain objects
    const json = JSON.parse(JSON.stringify(ed.getJSON())) as Record<string, unknown>;
    await updateMemo(memo.id, {
      title: title.trim(),
      content: json,
      contentText: ed.getText(),
      tags,
    });
    return true;
  }, [memo.id, title, tags]);

  const {
    saving,
    saved,
    saveError,
    scheduleSave,
    save,
    composingRef,
    detach,
  } = useAutoSave({ saveFn });

  // Track IME composition to prevent save during Korean input
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onStart = () => { composingRef.current = true; };
    const onEnd = () => {
      composingRef.current = false;
      scheduleSave();
    };
    dom.addEventListener('compositionstart', onStart);
    dom.addEventListener('compositionend', onEnd);
    return () => {
      dom.removeEventListener('compositionstart', onStart);
      dom.removeEventListener('compositionend', onEnd);
    };
  }, [editor, scheduleSave, composingRef]);

  // Save on any document change (checkbox toggles, text input, etc.)
  useEffect(() => {
    if (!editor) return;
    const onDocChange = () => {
      if (!composingRef.current) scheduleSave();
    };
    editor.on('update', onDocChange);
    return () => { editor.off('update', onDocChange); };
  }, [editor, scheduleSave, composingRef]);

  // Save on title change with debounce
  useEffect(() => {
    scheduleSave();
  }, [title, scheduleSave]);

  // Save when tags change
  useEffect(() => {
    scheduleSave();
  }, [tags, scheduleSave]);

  const handleBack = useCallback(async () => {
    // Detach listeners to prevent duplicate save during navigation
    detach();

    // Delete empty memo
    if (!title.trim() && (!editor || editor.isEmpty)) {
      await deleteMemo(memo.id);
    } else {
      const ok = await save();
      if (!ok) return; // Stay on page so user can retry
    }

    router.refresh();
    router.push('/memo');
  }, [editor, memo.id, title, save, router, detach]);

  const handleDelete = useCallback(async () => {
    await deleteMemo(memo.id);
    router.refresh();
    router.push('/memo');
  }, [memo.id, router]);

  const handleTogglePin = useCallback(async () => {
    const result = await toggleMemoPin(memo.id);
    if (result) setIsPinned(result.isPinned);
  }, [memo.id]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-primary -ml-1 p-1"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">메모</span>
        </button>

        <div className="flex items-center gap-1">
          {(saving || saved || saveError) && (
            <span className={cn('text-xs mr-2 flex items-center gap-1', saveError ? 'text-destructive' : 'text-muted-foreground')}>
              {saving ? '저장 중...' : saveError ? (
                <button onClick={save} className="flex items-center gap-1 hover:underline">
                  <RotateCcw className="h-3 w-3" />저장 실패 · 재시도
                </button>
              ) : <><Check className="h-3 w-3 text-primary" />저장됨</>}
            </span>
          )}
          <button
            onClick={handleTogglePin}
            className="p-2 rounded-md hover:bg-accent transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label={isPinned ? '고정 해제' : '고정'}
            aria-pressed={isPinned}
          >
            <Pin className={cn('h-5 w-5 transition-colors', isPinned ? 'text-primary' : 'text-muted-foreground')} />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-destructive min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="삭제"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>메모를 삭제할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  삭제된 메모는 복구할 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Toolbar */}
      <MemoToolbar editor={editor} />

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={200}
          className="w-full text-2xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/50 mb-3"
        />

        {/* Tag input area */}
        <TagInput tags={tags} onTagsChange={setTags} />

        <EditorContent
          editor={editor}
          className={cn(
            'prose dark:prose-invert max-w-none min-h-[50vh]',
            'prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4',
            'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
            'prose-blockquote:my-2',
            'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
            '[&_.tiptap]:min-h-[50vh]',
          )}
        />
      </div>
    </div>
  );
}
