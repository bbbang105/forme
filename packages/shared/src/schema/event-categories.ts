import {index, integer, pgTable, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const eventCategories = pgTable('event_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull(),
  icon: varchar('icon', { length: 10 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_event_categories_user').on(table.userId, table.sortOrder),
}));
