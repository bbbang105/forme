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
