'use client';

import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';

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
  return (
    <div className="flex items-center justify-between px-4 sm:px-0">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToday}
          className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 h-auto"
        >
          오늘
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevMonth} disabled={isFetching}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextMonth} disabled={isFetching}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
