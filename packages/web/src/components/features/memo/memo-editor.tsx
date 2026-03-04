'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import ImageResize from 'tiptap-extension-resize-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {common, createLowlight} from 'lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

const lowlight = createLowlight(common);
import {TaskListSort} from './task-list-sort';
import {CollapsibleHeading} from './collapsible-heading';
import {Extension} from '@tiptap/core';
import {createImageDropPlugin} from './image-drop-plugin';
import {ArrowLeft, Check, Pin, Plus, RotateCcw, Trash2, X} from 'lucide-react';
import {deleteMemo, toggleMemoPin, updateMemo} from '@/lib/actions/memos';
import {MemoToolbar} from './memo-toolbar';
import {cn} from '@/lib/utils';
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

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

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
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const composingRef = useRef(false);
  const isSavingRef = useRef(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Focus the tag input whenever it becomes visible
  useEffect(() => {
    if (showTagInput) {
      tagInputRef.current?.focus();
    }
  }, [showTagInput]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,    // replaced by CollapsibleHeading
        link: false,       // configured separately below
        underline: false,  // configured separately below
        codeBlock: false,  // replaced by CodeBlockLowlight
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
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
      ImageResize.configure({
        inline: false,
      }),
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

  const save = useCallback(async (): Promise<boolean> => {
    if (!editor) return true;
    if (isSavingRef.current) return true;
    isSavingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      // Deep clone to convert ProseMirror's null-prototype attrs to plain objects
      // (prevents Next.js RSC "temporary client reference" serialization issues)
      const json = JSON.parse(JSON.stringify(editor.getJSON())) as Record<string, unknown>;
      await updateMemo(memo.id, {
        title: title.trim(),
        content: json,
        contentText: editor.getText(),
        tags,
      });
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  }, [editor, memo.id, title, tags]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1000);
  }, [save]);

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
  }, [editor, scheduleSave]);

  // Save on any document change (checkbox toggles, text input, etc.)
  useEffect(() => {
    if (!editor) return;
    const onDocChange = () => {
      if (!composingRef.current) scheduleSave();
    };
    editor.on('update', onDocChange);
    return () => { editor.off('update', onDocChange); };
  }, [editor, scheduleSave]);

  // Save on title change with debounce
  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, scheduleSave]);

  // Save when tags change
  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tags, scheduleSave]);

  // Flush pending save on blur / page hide / beforeunload
  const blurHandlerRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const flushSave = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save();
    };
    blurHandlerRef.current = flushSave;
    const handleVisibilityChange = () => {
      if (document.hidden) flushSave();
    };
    window.addEventListener('blur', flushSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', flushSave);
    return () => {
      window.removeEventListener('blur', flushSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', flushSave);
      blurHandlerRef.current = null;
    };
  }, [save]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleBack = useCallback(async () => {
    // Flush pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Remove blur listener to prevent duplicate save during navigation
    if (blurHandlerRef.current) {
      window.removeEventListener('blur', blurHandlerRef.current);
      blurHandlerRef.current = null;
    }

    // Delete empty memo
    if (!title.trim() && (!editor || editor.isEmpty)) {
      await deleteMemo(memo.id);
    } else {
      const ok = await save();
      if (!ok) return; // Stay on page so user can retry
    }

    router.push('/memo');
  }, [editor, memo.id, title, save, router]);

  const handleDelete = useCallback(async () => {
    await deleteMemo(memo.id);
    router.push('/memo');
  }, [memo.id, router]);

  const handleTogglePin = useCallback(async () => {
    const result = await toggleMemoPin(memo.id);
    if (result) setIsPinned(result.isPinned);
  }, [memo.id]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) {
      setShowTagInput(false);
      setTagInput('');
      return;
    }
    if (trimmed.length > MAX_TAG_LENGTH) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      setShowTagInput(false);
      return;
    }
    if (tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    setShowTagInput(false);
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

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

      {/* Toolbar - 상단 고정 */}
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
        <div className="flex flex-wrap items-center gap-1.5 mb-4 min-h-[28px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-xs text-accent-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`태그 '${tag}' 제거`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {showTagInput ? (
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
                if (e.key === 'Escape') {
                  setTagInput('');
                  setShowTagInput(false);
                }
              }}
              onBlur={() => {
                addTag();
              }}
              placeholder="태그 입력..."
              maxLength={MAX_TAG_LENGTH}
              className="text-xs bg-accent/60 rounded-full px-2.5 py-0.5 outline-none w-24 placeholder:text-muted-foreground/60"
            />
          ) : tags.length < MAX_TAGS ? (
            <button
              type="button"
              onClick={() => setShowTagInput(true)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="태그 추가"
            >
              <Plus className="h-3 w-3" />
              <span>태그</span>
            </button>
          ) : null}
        </div>

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
