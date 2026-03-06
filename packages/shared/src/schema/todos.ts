import {boolean, date, index, integer, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  content: text('content').notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  reminderAt: timestamp('reminder_at', { withTimezone: true }),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dateIdx: index('idx_todos_date').on(table.userId, table.date),
  reminderIdx: index('idx_todos_reminder').on(table.reminderAt),
  completedDateIdx: index('idx_todos_completed_date').on(table.userId, table.isCompleted, table.date),
}));
