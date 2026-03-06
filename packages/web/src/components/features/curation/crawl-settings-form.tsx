'use client';

import {CalendarDays, RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {useState} from 'react';

type CrawlRange = '3d' | '7d' | '30d' | 'custom';

function computeSince(range: CrawlRange, customDate: string): string | undefined {
  switch (range) {
    case '3d':
      return new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'custom': {
      if (!customDate) return undefined;
      const d = new Date(customDate);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
  }
}

export interface CrawlSettingsFormProps {
  initialRange?: CrawlRange;
  initialCustomDate?: string;
  onStart: (since: string | undefined) => void;
  onCancel: () => void;
}

export function CrawlSettingsForm({
  initialRange = '3d',
  initialCustomDate = '',
  onStart,
  onCancel,
}: CrawlSettingsFormProps) {
  const [crawlRange, setCrawlRange] = useState<CrawlRange>(initialRange);
  const [customDate, setCustomDate] = useState(initialCustomDate);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" />
          수집 기간
        </label>
        <div className="flex gap-2">
          {([
            { value: '3d', label: '최근 3일' },
            { value: '7d', label: '최근 7일' },
            { value: '30d', label: '최근 30일' },
            { value: 'custom', label: '직접 선택' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCrawlRange(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                crawlRange === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {crawlRange === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onStart(computeSince(crawlRange, customDate))}
          disabled={crawlRange === 'custom' && !customDate}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          수집 시작
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
