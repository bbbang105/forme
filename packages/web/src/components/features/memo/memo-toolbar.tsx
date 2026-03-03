'use client';

import type {Editor} from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Link,
  Quote,
  Undo,
  Redo,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useCallback, useState} from 'react';

interface MemoToolbarProps {
  editor: Editor | null;
}

export function MemoToolbar({ editor }: MemoToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

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
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background">
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
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border bg-background overflow-x-auto scrollbar-hide">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        aria-label="Underline"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        aria-label="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        aria-label="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        aria-label="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        aria-label="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        aria-label="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        aria-label="Task List"
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        aria-label="Blockquote"
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
        aria-label="Link"
      >
        <Link className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="Undo"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        aria-label="Redo"
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
