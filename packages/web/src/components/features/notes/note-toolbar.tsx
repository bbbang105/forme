'use client';

import type {Editor} from '@tiptap/react';
import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Image as ImageIcon,
    Italic,
    Link,
    List,
    ListChecks,
    ListOrdered,
    Loader2,
    Quote,
    Redo,
    SquareCode,
    Strikethrough,
    Underline,
    Undo,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useCallback, useRef, useState} from 'react';

// ---------------------------------------------------------------------------
// Image upload hook
// ---------------------------------------------------------------------------

function useImageUpload(editor: Editor | null) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return;
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/notes/image', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[NoteToolbar] image upload failed:', data);
        return;
      }
      const { url } = await res.json() as { url: string };
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          console.error('[NoteToolbar] Unexpected image URL protocol:', parsed.protocol);
          return;
        }
      } catch {
        console.error('[NoteToolbar] Invalid image URL');
        return;
      }
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('[NoteToolbar] image upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [editor]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return { uploading, fileInputRef, handleImageFileChange, triggerFileSelect };
}

// ---------------------------------------------------------------------------
// Link input sub-component
// ---------------------------------------------------------------------------

interface LinkInputProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

function LinkInput({ initialUrl, onSubmit, onCancel }: LinkInputProps) {
  const [linkUrl, setLinkUrl] = useState(initialUrl);

  const handleSubmit = () => onSubmit(linkUrl);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background shrink-0">
      <label htmlFor="toolbar-link-url" className="sr-only">링크 URL 입력</label>
      <input
        id="toolbar-link-url"
        type="url"
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="URL을 입력하세요..."
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        autoFocus
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="text-xs font-medium text-primary px-2 py-1 min-h-[44px] flex items-center focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-label="링크 확인"
      >
        확인
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground px-2 py-1 min-h-[44px] flex items-center focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-label="링크 취소"
      >
        취소
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteToolbar — main export
// ---------------------------------------------------------------------------

interface NoteToolbarProps {
  editor: Editor | null;
}

export function NoteToolbar({ editor }: NoteToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [currentLinkUrl, setCurrentLinkUrl] = useState('');
  const { uploading, fileInputRef, handleImageFileChange, triggerFileSelect } = useImageUpload(editor);

  const handleLinkSubmit = useCallback((url: string) => {
    if (!editor) return;
    let resolved = url.trim();
    if (!resolved) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      if (!/^https?:\/\//i.test(resolved) && !/^mailto:/i.test(resolved)) {
        resolved = `https://${resolved}`;
      }
      try {
        const parsed = new URL(resolved);
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
          setShowLinkInput(false);
          return;
        }
      } catch {
        setShowLinkInput(false);
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: resolved }).run();
    }
    setShowLinkInput(false);
  }, [editor]);

  const handleLinkOpen = useCallback(() => {
    if (!editor) return;
    const currentUrl = editor.getAttributes('link').href ?? '';
    setCurrentLinkUrl(currentUrl);
    setShowLinkInput(true);
  }, [editor]);

  if (!editor) return null;

  if (showLinkInput) {
    return (
      <LinkInput
        initialUrl={currentLinkUrl}
        onSubmit={handleLinkSubmit}
        onCancel={() => setShowLinkInput(false)}
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-background overflow-x-auto scrollbar-hide shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={handleImageFileChange}
      />

      {/* History */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="실행 취소"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="다시 실행"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        aria-label="굵게"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        aria-label="기울임"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        aria-label="밑줄"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        aria-label="취소선"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        aria-label="제목 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        aria-label="제목 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        aria-label="제목 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        aria-label="글머리 기호"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        aria-label="번호 목록"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        aria-label="체크리스트"
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Blocks & media */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        aria-label="인용"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={handleLinkOpen}
        active={editor.isActive('link')}
        aria-label="링크"
      >
        <Link className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={triggerFileSelect}
        disabled={uploading}
        aria-label="이미지 삽입"
      >
        {uploading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <ImageIcon className="h-4 w-4" />
        }
      </ToolbarButton>

      <ToolbarDivider />

      {/* Code */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        aria-label="인라인 코드"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        aria-label="코드 블록"
      >
        <SquareCode className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolbarButton({
  active,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'p-2 rounded-md transition-colors shrink-0',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        disabled && 'opacity-30 pointer-events-none'
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" aria-hidden="true" />;
}
