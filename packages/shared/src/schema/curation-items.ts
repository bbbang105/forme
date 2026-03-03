import { pgTable, uuid, varchar, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { curationSources } from './curation-sources';

export const curationItems = pgTable('curation_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => curationSources.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  url: text('url').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  category: varchar('category', { length: 50 }).notNull(),
  tags: text('tags').array(),
  isRead: boolean('is_read').notNull().default(false),
  isBookmarked: boolean('is_bookmarked').notNull().default(false),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceUrlIdx: uniqueIndex('idx_items_source_url').on(table.sourceId, table.url),
  publishedIdx: index('idx_items_published').on(table.publishedAt),
  categoryIdx: index('idx_items_category').on(table.category),
  sourceIdx: index('idx_items_source').on(table.sourceId),
}));
