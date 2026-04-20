'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {EditorContent, useEditor} from '@tiptap/react';
import {ArrowLeft, Check, Pin, RotateCcw, Trash2} from 'lucide-react';
import {deleteNote, toggleMemoPin, updateNote} from '@/lib/actions/notes';
import {NoteToolbar} from './note-toolbar';
import {TagInput} from './tag-input';
import {cn} from '@/lib/utils';
import {useAutoSave} from '@/hooks/use-auto-save';
import {useEditorConfig} from './use-editor-config';
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

interface NoteEditorProps {
  note: {
    id: string;
    title: string | null;
    content: unknown;
    isPinned: boolean;
    tags?: string[] | null;
  };
}

export function NoteEditor({ note }: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title ?? '');
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);

  // Stable extension config — avoids reinitializing the editor on every render
  const extensions = useEditorConfig();

  const editor = useEditor({
    extensions,
    // Deep clone to strip ProseMirror null-prototype objects & RSC references
    content: (note.content && typeof note.content === 'object' && Object.keys(note.content as Record<string, unknown>).length > 0)
      ? JSON.parse(JSON.stringify(note.content))
      : undefined,
    immediatelyRender: false,
  });

  // Keep a stable ref to the current editor instance so saveFn does not
  // close over a stale value (avoids needing editor in saveFn deps).
  const editorRef = useRef(editor);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  const saveFn = useCallback(async (): Promise<boolean> => {
    const ed = editorRef.current;
    if (!ed) return true;
    // Deep clone to convert ProseMirror's null-prototype attrs to plain objects
    const json = JSON.parse(JSON.stringify(ed.getJSON())) as Record<string, unknown>;
    await updateNote(note.id, {
      title: title.trim(),
      content: json,
      contentText: ed.getText(),
      tags,
    });
    return true;
  }, [note.id, title, tags]);

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
    detach();

    if (!title.trim() && (!editor || editor.isEmpty)) {
      await deleteNote(note.id);
    } else {
      const ok = await save();
      if (!ok) return;
    }

    router.refresh();
    router.push('/note');
  }, [editor, note.id, title, save, router, detach]);

  const handleDelete = useCallback(async () => {
    await deleteNote(note.id);
    router.refresh();
    router.push('/note');
  }, [note.id, router]);

  const handleTogglePin = useCallback(async () => {
    const result = await toggleMemoPin(note.id);
    if (result) setIsPinned(result.isPinned);
  }, [note.id]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <button
          onClick={handleBack}
          aria-label="노트 목록으로 돌아가기"
          className="flex items-center gap-1 text-sm text-primary -ml-1 p-1 min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">노트</span>
        </button>

        <div className="flex items-center gap-1">
          {(saving || saved || saveError) && (
            <span
              role="status"
              aria-live="polite"
              className={cn('text-xs mr-2 flex items-center gap-1', saveError ? 'text-destructive' : 'text-muted-foreground')}
            >
              {saving ? '저장 중...' : saveError ? (
                <button onClick={save} className="flex items-center gap-1 hover:underline">
                  <RotateCcw className="h-3 w-3" />저장 실패 · 재시도
                </button>
              ) : <><Check className="h-3 w-3 text-primary" />저장됨</>}
            </span>
          )}
          <button
            onClick={handleTogglePin}
            className="p-2 rounded-md hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isPinned ? '고정 해제' : '고정'}
            aria-pressed={isPinned}
          >
            <Pin className={cn('h-5 w-5 transition-colors', isPinned ? 'text-primary' : 'text-muted-foreground')} />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-destructive min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="삭제"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>노트를 삭제할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  삭제된 노트는 복구할 수 없습니다.
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
      <NoteToolbar editor={editor} />

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        <label htmlFor="note-title" className="sr-only">노트 제목</label>
        <input
          id="note-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={200}
          className="w-full text-2xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/50 mb-3 focus-visible:ring-0"
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
