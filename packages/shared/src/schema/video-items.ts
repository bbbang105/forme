import {boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {videoSources} from './video-sources';

export const videoItems = pgTable('video_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceId: uuid('source_id').notNull().references(() => videoSources.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  channelName: text('channel_name').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('collected'),
  summarySource: text('summary_source'),
  summary: text('summary'),
  keywords: text('keywords').array(),
  oneLiner: text('one_liner'),
  isRead: boolean('is_read').notNull().default(false),
  isBookmarked: boolean('is_bookmarked').notNull().default(false),
  memo: text('memo'),
  collectionId: uuid('collection_id'),
  duration: integer('duration'),
  summarizedAt: timestamp('summarized_at', { withTimezone: true }),
}, (table) => ({
  userVideoIdx: uniqueIndex('idx_video_items_user_video').on(table.userId, table.videoId),
  feedIdx: index('idx_video_items_feed').on(table.userId, table.status, table.publishedAt),
  readIdx: index('idx_video_items_read').on(table.userId, table.isRead, table.publishedAt),
  bookmarkIdx: index('idx_video_items_bookmark').on(table.userId, table.isBookmarked, table.publishedAt),
}));
