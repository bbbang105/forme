import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { profiles } from '../schema/profiles';
import type { curationSources } from '../schema/curation-sources';
import type { curationItems } from '../schema/curation-items';
import type { calendarEvents } from '../schema/calendar-events';
import type { todos } from '../schema/todos';

export type Profile = InferSelectModel<typeof profiles>;
export type NewProfile = InferInsertModel<typeof profiles>;

export type CurationSource = InferSelectModel<typeof curationSources>;
export type NewCurationSource = InferInsertModel<typeof curationSources>;

export type CurationItem = InferSelectModel<typeof curationItems>;
export type NewCurationItem = InferInsertModel<typeof curationItems>;

export type CalendarEvent = InferSelectModel<typeof calendarEvents>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEvents>;

export type Todo = InferSelectModel<typeof todos>;
export type NewTodo = InferInsertModel<typeof todos>;
