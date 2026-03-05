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
