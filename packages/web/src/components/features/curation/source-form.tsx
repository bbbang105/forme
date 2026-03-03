'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const categories = [...new Set(['ai', 'uxui', 'economy', ...existingCategories])];

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
