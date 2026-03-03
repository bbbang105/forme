import {bigint, index, integer, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

export const podcastEpisodes = pgTable('podcast_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  audioUrl: text('audio_url').notNull(),
  duration: integer('duration'), // seconds
  fileSize: bigint('file_size', { mode: 'number' }), // bytes
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userPublishedIdx: index('idx_podcast_episodes_user_published').on(
    table.userId,
    table.publishedAt
  ),
}));
