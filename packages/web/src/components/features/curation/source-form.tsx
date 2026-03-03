'use client';

import {useState} from 'react';
import {Bot, ChevronDown, ChevronUp, Code2, Loader2, Palette, Plus, Save, TrendingUp} from 'lucide-react';
import {INTEREST_OPTIONS} from '@forme/shared/config';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const FIXED_CATEGORIES = [
  { value: 'ai', label: 'AI', icon: Bot },
  { value: 'dev', label: 'DEV', icon: Code2 },
  { value: 'uxui', label: 'UXUI', icon: Palette },
  { value: 'economy', label: 'ECONOMY', icon: TrendingUp },
] as const;

interface SourceFormData {
  name: string;
  url: string;
  category: string;
  rssUrl?: string;
  tags?: string[];
}

interface SourceFormProps {
  existingCategories: string[];
  onSubmit: (data: SourceFormData) => Promise<void>;
  onCancel: () => void;
  /** Pre-fill for edit mode */
  initialData?: {
    name: string;
    url: string;
    category: string;
    rssUrl: string | null;
    tags: string[] | null;
  };
}

export function SourceForm({
  existingCategories,
  onSubmit,
  onCancel,
  initialData,
}: SourceFormProps) {
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [url, setUrl] = useState(initialData?.url ?? '');
  const [category, setCategory] = useState(initialData?.category ?? 'ai');
  const [rssUrl, setRssUrl] = useState(initialData?.rssUrl ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData?.tags ?? []);
  const [tagsExpanded, setTagsExpanded] = useState(isEdit && (initialData?.tags?.length ?? 0) > 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !url.trim() || !category) {
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
        category,
        rssUrl: rssUrl.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `소스 ${isEdit ? '수정' : '추가'}에 실패했습니다.`);
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
        <Label>카테고리</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {FIXED_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-all cursor-pointer',
                category === value
                  ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
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
                    'transition-all cursor-pointer ring-1 ring-inset',
                    isSelected
                      ? 'bg-primary/15 text-primary ring-primary/30'
                      : 'text-muted-foreground ring-border hover:bg-accent hover:text-accent-foreground'
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
          ) : isEdit ? (
            <>
              <Save className="h-4 w-4 mr-1" />
              저장
            </>
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
