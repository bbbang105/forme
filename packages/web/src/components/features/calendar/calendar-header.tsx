'use client';

import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {ChevronLeft, ChevronRight} from 'lucide-react';

export interface CalendarHeaderProps {
  currentMonth: Date;
  isFetching: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export function CalendarHeader({
  currentMonth,
  isFetching,
  onPrevMonth,
  onNextMonth,
  onToday,
}: CalendarHeaderProps) {
  const monthLabel = format(currentMonth, 'yyyy년 M월', {locale: ko});
  const monthMono = format(currentMonth, 'yyyy.MM').toUpperCase();

  return (
    <div className="flex items-center justify-between px-4 sm:px-0 pb-3 border-b border-border">
      <div className="flex items-baseline gap-4 min-w-0">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground shrink-0">
          <span className="text-primary" aria-hidden="true">—</span> {monthMono}
        </span>
        <h2 className="font-display text-2xl sm:text-3xl leading-none text-foreground truncate">
          {monthLabel}
        </h2>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToday}
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          Today
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onPrevMonth}
            disabled={isFetching}
            aria-label="이전 달"
            className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={isFetching}
            aria-label="다음 달"
            className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
