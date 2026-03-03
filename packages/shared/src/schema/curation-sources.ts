import {boolean, index, integer, pgTable, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const curationSources = pgTable('curation_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  url: text('url').notNull(),
  rssUrl: text('rss_url'),
  category: varchar('category', { length: 50 }).notNull().default('ai'),
  tags: text('tags').array(),
  isActive: boolean('is_active').notNull().default(true),
  isFavorite: boolean('is_favorite').notNull().default(false),
  favoriteOrder: integer('favorite_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_sources_user').on(table.userId),
  userFavOrderIdx: index('idx_sources_user_fav_order').on(
    table.userId,
    table.isFavorite,
    table.favoriteOrder
  ),
}));
