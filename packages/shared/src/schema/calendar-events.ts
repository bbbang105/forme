import {date, index, pgTable, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  color: varchar('color', { length: 20 }).notNull().default('#3b82f6'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  datesIdx: index('idx_calendar_events_dates').on(table.startDate, table.endDate),
  userIdx: index('idx_calendar_events_user').on(table.userId),
}));
