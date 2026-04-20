import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { profiles } from '../schema/profiles';
import type { feedSources } from '../schema/feed-sources';
import type { feedItems } from '../schema/feed-items';
import type { calendarEvents } from '../schema/calendar-events';
import type { todos } from '../schema/todos';

export type Profile = InferSelectModel<typeof profiles>;
export type NewProfile = InferInsertModel<typeof profiles>;

export type FeedSource = InferSelectModel<typeof feedSources>;
export type NewFeedSource = InferInsertModel<typeof feedSources>;

export type FeedItem = InferSelectModel<typeof feedItems>;
export type NewFeedItem = InferInsertModel<typeof feedItems>;

export type CalendarEvent = InferSelectModel<typeof calendarEvents>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEvents>;

export type Todo = InferSelectModel<typeof todos>;
export type NewTodo = InferInsertModel<typeof todos>;
