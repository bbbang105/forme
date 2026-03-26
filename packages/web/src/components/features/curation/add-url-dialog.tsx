'use client';

import {useCallback, useRef, useState} from 'react';
import {AlertCircle, Link2, Loader2} from 'lucide-react';
import Image from 'next/image';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {INTEREST_OPTIONS} from '@forme/shared/config';

type Step = 'idle' | 'fetching' | 'preview' | 'saving' | 'error';

const CATEGORIES = [
  {value: 'ai', label: 'AI'},
  {value: 'dev', label: 'DEV'},
  {value: 'uxui', label: 'UXUI'},
  {value: 'economy', label: 'ECONOMY'},
] as const;

interface AddUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function AddUrlDialog({open, onOpenChange, onComplete}: AddUrlDialogProps) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 편집 가능한 미리보기 필드
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('ai');
  const [tags, setTags] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const reset = useCallback(() => {
    setUrl('');
    setStep('idle');
    setErrorMsg('');
    setTitle('');
    setDescription('');
    setCategory('ai');
    setTags([]);
    setThumbnailUrl(null);
    setThumbFailed(false);
  }, []);

  const handleClose = useCallback(
    (o: boolean) => {
      if (!o) {
        abortRef.current?.abort();
        reset();
      }
      onOpenChange(o);
    },
    [onOpenChange, reset],
  );

  // 1단계: OG 메타 가져오기
  const handleFetchMeta = async () => {
    if (!url.trim()) return;
    setStep('fetching');
    setErrorMsg('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/curation/add-url', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: url.trim(), preview: true}),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setStep('error');
        setErrorMsg(data.error || '정보를 가져올 수 없습니다');
        return;
      }

      setTitle(data.title || '');
      setDescription(data.description || '');
      setThumbnailUrl(data.thumbnailUrl || null);
      setThumbFailed(false);
      setStep('preview');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStep('error');
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
    }
  };

  // 2단계: 편집값으로 저장
  const handleSave = async () => {
    if (!title.trim()) return;
    setStep('saving');
    setErrorMsg('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/curation/add-url', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim(),
          description: description.trim() || null,
          category,
          tags,
          thumbnailUrl,
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setStep('preview');
        setErrorMsg(data.error || '등록에 실패했습니다');
        return;
      }

      onComplete();
      reset();
      onOpenChange(false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStep('preview');
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
    }
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev,
    );
  };

  const isProcessing = step === 'fetching' || step === 'saving';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg !max-h-[90vh] !inset-y-auto !top-1/2 !-translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            URL 직접 추가
          </DialogTitle>
          <DialogDescription>글 링크를 입력하면 정보를 가져와 편집할 수 있습니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL Input */}
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isProcessing && url.trim() && step === 'idle') handleFetchMeta();
              }}
              placeholder="https://example.com/article"
              disabled={step !== 'idle' && step !== 'error'}
              aria-label="글 URL"
              className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
            />
            {step === 'idle' || step === 'error' ? (
              <Button
                onClick={handleFetchMeta}
                disabled={!url.trim()}
                size="sm"
                className="h-10 px-4 shrink-0"
              >
                가져오기
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-3 shrink-0"
                onClick={() => {
                  abortRef.current?.abort();
                  reset();
                }}
              >
                초기화
              </Button>
            )}
          </div>

          {/* Fetching indicator */}
          {step === 'fetching' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              정보 가져오는 중...
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errorMsg}
            </div>
          )}

          {/* Preview / Edit Form */}
          {(step === 'preview' || step === 'saving') && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              {/* Thumbnail preview */}
              {thumbnailUrl && !thumbFailed && (
                <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
                  <Image
                    src={thumbnailUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 480px) 100vw, 480px"
                    unoptimized
                    onError={() => setThumbFailed(true)}
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <label htmlFor="add-url-title" className="block text-xs font-medium text-muted-foreground mb-1">
                  제목
                </label>
                <input
                  id="add-url-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={500}
                  disabled={step === 'saving'}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="add-url-desc" className="block text-xs font-medium text-muted-foreground mb-1">
                  설명
                </label>
                <textarea
                  id="add-url-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={300}
                  rows={3}
                  disabled={step === 'saving'}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground/50">{description.length}/300</span>
              </div>

              {/* Category */}
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1">카테고리</span>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      disabled={step === 'saving'}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        category === cat.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                      } disabled:opacity-50`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags — INTEREST_OPTIONS 클릭 토글 */}
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                  태그 ({tags.length}개)
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                  {INTEREST_OPTIONS.map((tag) => {
                    const selected = tags.includes(tag);
                    const disabled = !selected && tags.length >= 5;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        disabled={disabled || step === 'saving'}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ring-1 ring-inset disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected
                          ? 'bg-primary/15 text-primary ring-primary/30'
                          : 'bg-transparent text-muted-foreground ring-border hover:bg-muted/40'
                      }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {tags.length >= 5 && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">최대 5개까지 선택할 수 있습니다</p>
                )}
              </div>

              {/* Save button */}
              <Button
                onClick={handleSave}
                disabled={!title.trim() || step === 'saving'}
                className="w-full"
              >
                {step === 'saving' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                    등록 중...
                  </>
                ) : (
                  '등록'
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
