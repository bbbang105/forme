'use client';

import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {Calendar, Pencil} from 'lucide-react';
import {cn} from '@/lib/utils';

interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description: string | null;
}

interface EventListProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onEdit: (event: CalendarEvent) => void;
}

export function EventList({ events, selectedDate, onEdit }: EventListProps) {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Filter events that span the selected date
  const dayEvents = events.filter((event) => {
    return event.startDate <= dateStr && event.endDate >= dateStr;
  });

  if (dayEvents.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1.5">
        <Calendar className="h-3 w-3" />
        일정 ({dayEvents.length})
      </p>
      {dayEvents.map((event) => {
        const isMultiDay = event.startDate !== event.endDate;
        const startD = new Date(event.startDate + 'T00:00:00');
        const endD = new Date(event.endDate + 'T00:00:00');

        return (
          <button
            key={event.id}
            onClick={() => onEdit(event)}
            className={cn(
              'group w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left',
              'hover:bg-muted/50',
            )}
          >
            <span
              className="w-1 h-full min-h-[20px] rounded-full flex-shrink-0 mt-0.5"
              style={{ backgroundColor: event.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{event.title}</p>
              {isMultiDay && (
                <p className="text-xs text-muted-foreground">
                  {format(startD, 'M.d', { locale: ko })} - {format(endD, 'M.d', { locale: ko })}
                </p>
              )}
              {event.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {event.description}
                </p>
              )}
            </div>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
          </button>
        );
      })}
    </div>
  );
}
