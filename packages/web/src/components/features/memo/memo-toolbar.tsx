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

interface MemoToolbarProps {
  editor: Editor | null;
}

export function MemoToolbar({ editor }: MemoToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return;
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    // Reset input so the same file can be re-selected if needed
    fileInputRef.current.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/memo/image', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[MemoToolbar] image upload failed:', data);
        return;
      }
      const { url } = await res.json() as { url: string };
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          console.error('[MemoToolbar] Unexpected image URL protocol:', parsed.protocol);
          return;
        }
      } catch {
        console.error('[MemoToolbar] Invalid image URL');
        return;
      }
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('[MemoToolbar] image upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [editor]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;
    let url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        url = `https://${url}`;
      }
      // Validate URL protocol
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
          setLinkUrl('');
          setShowLinkInput(false);
          return;
        }
      } catch {
        setLinkUrl('');
        setShowLinkInput(false);
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  if (showLinkInput) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background shrink-0">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLinkSubmit();
            if (e.key === 'Escape') setShowLinkInput(false);
          }}
          placeholder="URL을 입력하세요..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        <button
          onClick={handleLinkSubmit}
          className="text-xs font-medium text-primary px-2 py-1"
        >
          확인
        </button>
        <button
          onClick={() => setShowLinkInput(false)}
          className="text-xs text-muted-foreground px-2 py-1"
        >
          취소
        </button>
      </div>
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

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        aria-label="인용"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          const currentUrl = editor.getAttributes('link').href ?? '';
          setLinkUrl(currentUrl);
          setShowLinkInput(true);
        }}
        active={editor.isActive('link')}
        aria-label="링크"
      >
        <Link className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="이미지 삽입"
      >
        {uploading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <ImageIcon className="h-4 w-4" />
        }
      </ToolbarButton>

      <ToolbarDivider />

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

      <ToolbarDivider />

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
    </div>
  );
}

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
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}
