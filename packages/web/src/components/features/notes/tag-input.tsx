'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Plus, X} from 'lucide-react';

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

export interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagInput({ tags, onTagsChange }: TagInputProps) {
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Focus the tag input whenever it becomes visible
  useEffect(() => {
    if (showTagInput) {
      tagInputRef.current?.focus();
    }
  }, [showTagInput]);

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
    onTagsChange([...tags, trimmed]);
    setTagInput('');
    setShowTagInput(false);
  }, [tagInput, tags, onTagsChange]);

  const removeTag = useCallback((tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  }, [tags, onTagsChange]);

  return (
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
          onBlur={(e) => {
            // Prevent double-fire when Enter triggers blur
            if (e.relatedTarget) return;
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
  );
}
