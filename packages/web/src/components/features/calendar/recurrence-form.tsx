'use client';

import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {cn} from '@/lib/utils';

export interface RecurrenceFormProps {
  recurrenceType: 'weekly' | 'biweekly';
  onRecurrenceTypeChange: (type: 'weekly' | 'biweekly') => void;
  recurrenceDays: number[];
  onToggleDay: (day: number) => void;
  recurrenceEndDate: string;
  onRecurrenceEndDateChange: (date: string) => void;
  minDate: string;
}

export function RecurrenceForm({
  recurrenceType,
  onRecurrenceTypeChange,
  recurrenceDays,
  onToggleDay,
  recurrenceEndDate,
  onRecurrenceEndDateChange,
  minDate,
}: RecurrenceFormProps) {
  return (
    <div className="space-y-3 animate-fade-in">
      {/* 매주/격주 */}
      <div className="flex gap-2">
        {(['weekly', 'biweekly'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onRecurrenceTypeChange(type)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              recurrenceType === type
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            )}
          >
            {type === 'weekly' ? '매주' : '격주'}
          </button>
        ))}
      </div>

      {/* 요일 선택 */}
      <div className="flex gap-1.5">
        {['일', '월', '화', '수', '목', '금', '토'].map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggleDay(i)}
            className={cn(
              'w-8 h-8 rounded-full text-xs font-medium transition-colors',
              recurrenceDays.includes(i)
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-muted/50'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 반복 종료일 */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">반복 종료일 (선택)</Label>
        <Input
          type="date"
          value={recurrenceEndDate}
          onChange={(e) => onRecurrenceEndDateChange(e.target.value)}
          min={minDate || undefined}
        />
      </div>
    </div>
  );
}
