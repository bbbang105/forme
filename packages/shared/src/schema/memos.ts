import {boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const memos = pgTable('memos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 200 }),
  content: jsonb('content').notNull().default({}),
  contentText: text('content_text').notNull().default(''),
  isPinned: boolean('is_pinned').notNull().default(false),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  listIdx: index('idx_memos_list').on(table.userId, table.isPinned, table.updatedAt),
  searchIdx: index('idx_memos_search').on(table.userId, table.contentText),
}));
