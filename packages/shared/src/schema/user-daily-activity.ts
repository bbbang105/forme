import { boolean, date, integer, pgTable, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

export const userDailyActivity = pgTable('user_daily_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  loggedIn: boolean('logged_in').notNull().default(true),
  podcastListenSeconds: integer('podcast_listen_seconds').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateUniq: uniqueIndex('idx_user_daily_activity_user_date').on(table.userId, table.date),
}));
