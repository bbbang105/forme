import {boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar} from 'drizzle-orm/pg-core';

export const videoSources = pgTable('video_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  channelId: varchar('channel_id', { length: 24 }).notNull(),
  channelName: varchar('channel_name', { length: 200 }).notNull(),
  channelThumbnail: text('channel_thumbnail'),
  isFavorite: boolean('is_favorite').notNull().default(false),
  favoriteOrder: integer('favorite_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userChannelIdx: uniqueIndex('idx_video_sources_user_channel').on(table.userId, table.channelId),
}));
