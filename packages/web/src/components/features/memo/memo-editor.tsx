'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useEditor, EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {ArrowLeft, EllipsisVertical, Pin, PinOff, Trash2, Check} from 'lucide-react';
import {updateMemo, deleteMemo, toggleMemoPin} from '@/lib/actions/memos';
import {MemoToolbar} from './memo-toolbar';
import {cn} from '@/lib/utils';

interface MemoEditorProps {
  memo: {
    id: string;
    title: string | null;
    content: unknown;
    isPinned: boolean;
  };
}

export function MemoEditor({ memo }: MemoEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(memo.title ?? '');
  const [isPinned, setIsPinned] = useState(memo.isPinned);
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasContentRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: {
          class: 'text-primary underline',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({ placeholder: '내용을 입력하세요...' }),
      CharacterCount,
    ],
    content: (memo.content && typeof memo.content === 'object' && Object.keys(memo.content as Record<string, unknown>).length > 0)
      ? memo.content
      : undefined,
    immediatelyRender: false,
    onUpdate: () => {
      scheduleSave();
    },
  });

  // Track if memo has content
  useEffect(() => {
    if (editor) {
      hasContentRef.current = !editor.isEmpty || title.trim() !== '';
    }
  }, [editor, title]);

  const save = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await updateMemo(memo.id, {
        title: title.trim(),
        content: editor.getJSON() as Record<string, unknown>,
        contentText: editor.getText(),
      });
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [editor, memo.id, title]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1000);
  }, [save]);

  // Save on title change with debounce
  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, scheduleSave]);

  // Save on blur
  useEffect(() => {
    const handleBlur = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save();
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [save]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBack = useCallback(async () => {
    // Flush pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Delete empty memo
    if (!title.trim() && (!editor || editor.isEmpty)) {
      await deleteMemo(memo.id);
    } else {
      await save();
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
    setShowMenu(false);
  }, [memo.id]);

  return (
    <div className="flex flex-col h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-primary -ml-1 p-1"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">메모</span>
        </button>

        <div className="flex items-center gap-1">
          {(saving || saved) && (
            <span className="text-xs text-muted-foreground mr-2 flex items-center gap-1">
              {saving ? '저장 중...' : <><Check className="h-3 w-3 text-primary" />저장됨</>}
            </span>
          )}
          {isPinned && (
            <Pin className="h-3.5 w-3.5 text-primary" />
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-md hover:bg-accent transition-colors"
            >
              <EllipsisVertical className="h-5 w-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-background shadow-lg py-1 z-20">
                <button
                  onClick={handleTogglePin}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {isPinned ? '고정 해제' : '고정'}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={200}
          className="w-full text-2xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/50 mb-4"
        />
        <EditorContent
          editor={editor}
          className={cn(
            'prose prose-sm dark:prose-invert max-w-none min-h-[50vh]',
            'prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4',
            'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
            'prose-blockquote:my-2 prose-blockquote:border-primary/30',
            'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
            '[&_.tiptap]:outline-none [&_.tiptap]:min-h-[50vh]',
            '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0',
            '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2',
            '[&_ul[data-type=taskList]_li_label]:mt-0.5',
            '[&_ul[data-type=taskList]_li_input]:mt-1 [&_ul[data-type=taskList]_li_input]:accent-primary',
          )}
        />
      </div>

      {/* Toolbar */}
      <div className="sticky bottom-0">
        <MemoToolbar editor={editor} />
      </div>
    </div>
  );
}
