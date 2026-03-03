'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import { INTEREST_OPTIONS, getTagColor } from '@forme/shared/config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SourceFormProps {
  existingCategories: string[];
  onSubmit: (data: {
    name: string;
    url: string;
    category: string;
    rssUrl?: string;
    tags?: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

export function SourceForm({
  existingCategories,
  onSubmit,
  onCancel,
}: SourceFormProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('ai');
  const [customCategory, setCustomCategory] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const categories = [...new Set(['ai', 'uxui', 'economy', ...existingCategories])];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalCategory = isCustom ? customCategory.trim() : category;
    if (!name.trim() || !url.trim() || !finalCategory) {
      setError('이름, URL, 카테고리를 모두 입력해주세요.');
      return;
    }

    try {
      new URL(url.trim());
    } catch {
      setError('유효한 URL을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        category: finalCategory,
        rssUrl: rssUrl.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '소스 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="source-name">이름</Label>
        <Input
          id="source-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: GeekNews"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="source-url">사이트 URL</Label>
        <Input
          id="source-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://news.hada.io"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="source-category">카테고리</Label>
        {!isCustom ? (
          <div className="flex gap-2">
            <select
              id="source-category"
              value={category}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setIsCustom(true);
                } else {
                  setCategory(e.target.value);
                }
              }}
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="__custom__">+ 새 카테고리</option>
            </select>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="새 카테고리 이름"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCustom(false);
                setCustomCategory('');
              }}
            >
              취소
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="source-rss">
          RSS URL <span className="text-muted-foreground">(선택)</span>
        </Label>
        <Input
          id="source-rss"
          type="url"
          value={rssUrl}
          onChange={(e) => setRssUrl(e.target.value)}
          placeholder="비워두면 자동 감지를 시도합니다"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setTagsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors cursor-pointer"
        >
          태그
          {selectedTags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({selectedTags.length}개)
            </span>
          )}
          {tagsExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {tagsExpanded && (
          <div className="flex flex-wrap gap-1.5">
            {INTEREST_OPTIONS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                    'transition-all cursor-pointer',
                    getTagColor(tag, isSelected),
                    !isSelected && 'hover:opacity-80'
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          취소
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              추가
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
