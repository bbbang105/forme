'use client';

import {useMemo} from 'react';
import {format} from 'date-fns';
import {CheckCircle2, Circle, MapPin, Pencil, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {CalendarEvent, EventCategory} from './types';

interface EventListProps {
  events: CalendarEvent[];
  selectedDate: Date;
  categories: EventCategory[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onToggle: (eventId: string, isCompleted: boolean) => void;
}

export function EventList({ events, selectedDate, categories, onEdit, onDelete, onToggle }: EventListProps) {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const dayEvents = useMemo(() =>
    events
      .filter((e) => e.startDate <= dateStr && e.endDate >= dateStr)
      .sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.startTime) return -1;
        if (b.startTime) return 1;
        return 0;
      }),
    [events, dateStr],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<string, EventCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  if (dayEvents.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1">
        일정 ({dayEvents.length})
      </p>
      {dayEvents.map((event) => {
        const category = event.categoryId ? categoryMap.get(event.categoryId) : undefined;
        const isMultiDay = event.startDate !== event.endDate;

        return (
          <div
            key={event.id}
            className={cn(
              'group flex items-start gap-2.5 p-3 sm:p-3.5 rounded-lg border border-border/50 bg-card transition-all',
              event.isCompleted && 'opacity-50'
            )}
          >
            {/* 완료 체크 */}
            <button
              onClick={() => onToggle(event.id, !event.isCompleted)}
              className="mt-0.5 shrink-0 transition-transform active:scale-95"
            >
              {event.isCompleted
                ? <CheckCircle2 className="h-[18px] w-[18px] text-primary" />
                : <Circle className="h-[18px] w-[18px] text-muted-foreground/40 hover:text-muted-foreground/60" />
              }
            </button>

            {/* 카테고리 색상 바 + 내용 */}
            <div
              className="flex-1 min-w-0 border-l-[3px] pl-2.5"
              style={{ borderColor: event.color }}
            >
              {/* 시간 */}
              <p className="text-xs text-muted-foreground">
                {event.startTime
                  ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
                  : '종일'}
                {isMultiDay && (
                  <span className="ml-1.5">
                    ({format(new Date(event.startDate + 'T00:00:00'), 'M.d')} - {format(new Date(event.endDate + 'T00:00:00'), 'M.d')})
                  </span>
                )}
              </p>

              {/* 제목 */}
              <p className={cn('text-sm font-medium mt-0.5', event.isCompleted && 'line-through text-muted-foreground')}>
                {category && <span className="mr-1">{category.icon}</span>}
                {event.title}
              </p>

              {/* 장소 */}
              {event.location && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </p>
              )}

              {/* 설명 */}
              {event.description && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                  {event.description}
                </p>
              )}
            </div>

            {/* 수정 / 삭제 */}
            <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(event)}
                className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(event.id)}
                className="p-1.5 rounded hover:bg-destructive/10 text-destructive/50 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
