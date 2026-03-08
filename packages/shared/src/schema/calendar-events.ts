import {boolean, date, index, integer, pgTable, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  startTime: varchar('start_time', { length: 5 }),
  endTime: varchar('end_time', { length: 5 }),
  color: varchar('color', { length: 20 }).notNull().default('#3b82f6'),
  description: text('description'),
  location: varchar('location', { length: 200 }),
  categoryId: uuid('category_id'),
  isCompleted: boolean('is_completed').notNull().default(false),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  recurrenceType: varchar('recurrence_type', { length: 10 }),
  recurrenceDays: integer('recurrence_days').array(),
  recurrenceEndDate: date('recurrence_end_date'),
  excludedDates: date('excluded_dates').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDatesIdx: index('idx_calendar_events_user_dates').on(table.userId, table.startDate, table.endDate),
}));
