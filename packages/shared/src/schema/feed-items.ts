import {boolean, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar} from 'drizzle-orm/pg-core';
import {feedSources} from './feed-sources';
import {bookmarkCollections} from './bookmark-collections';

export const feedItems = pgTable('feed_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => feedSources.id, { onDelete: 'cascade' }),
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
  readAt: timestamp('read_at', { withTimezone: true }),
  memo: text('memo'),
  collectionId: uuid('collection_id').references(() => bookmarkCollections.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  sourceUrlIdx: uniqueIndex('idx_items_source_url').on(table.sourceId, table.url),
  publishedIdx: index('idx_items_published').on(table.publishedAt),
  categoryIdx: index('idx_items_category').on(table.category),
  sourceIdx: index('idx_items_source').on(table.sourceId),
  readAtIdx: index('idx_items_read_at').on(table.readAt),
  filtersIdx: index('idx_items_filters').on(table.sourceId, table.isRead, table.isBookmarked, table.category),
  collectionIdx: index('idx_items_collection').on(table.collectionId),
  deletedAtIdx: index('idx_items_deleted_at').on(table.deletedAt),
}));
