export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  color: string;
  description: string | null;
  location: string | null;
  categoryId: string | null;
  isCompleted: boolean;
  recurrenceType: string | null;
  recurrenceDays: number[] | null;
  recurrenceEndDate: string | null;
  excludedDates: string[] | null;
  completedDates: string[] | null;
  // 가상 인스턴스용 (UI에서만 사용)
  _originalId?: string;
  _instanceDate?: string;
}

export interface Todo {
  id: string;
  date: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Discriminated union for EventForm create vs edit mode
// ---------------------------------------------------------------------------

/** Shared props for both create and edit modes */
interface EventFormBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  categories: EventCategory[];
  onEventCreate: (event: CalendarEvent) => void;
  onEventUpdate: (event: CalendarEvent) => void;
  onEventDelete: (eventId: string) => void;
  onManageCategories?: () => void;
  onExcludeDate?: (eventId: string, dateStr: string) => void;
  onDeleteAfter?: (eventId: string, dateStr: string) => void;
}

/** Props when creating a new event */
export interface EventFormCreateProps extends EventFormBaseProps {
  event?: null;
}

/** Props when editing an existing event */
export interface EventFormEditProps extends EventFormBaseProps {
  event: CalendarEvent;
}

/** Discriminated union for EventForm — covers both create and edit modes */
export type EventFormProps = EventFormCreateProps | EventFormEditProps;
