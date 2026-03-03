import {config} from 'dotenv';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const statements = [
  // ── podcast_episodes ──
  `CREATE TABLE IF NOT EXISTS podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    audio_url TEXT NOT NULL,
    duration INTEGER,
    file_size BIGINT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_podcast_episodes_user_published
    ON podcast_episodes (user_id, published_at)`,

  // ── push_subscriptions ──
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint
    ON push_subscriptions (endpoint)`,
  `CREATE INDEX IF NOT EXISTS idx_push_subs_user
    ON push_subscriptions (user_id)`,
];

for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    console.log('OK:', stmt.split('\n')[0].trim());
  } catch (err) {
    console.error('FAIL:', stmt.split('\n')[0].trim(), '-', err.message);
  }
}

console.log('\nAll tables and indexes created.');
await sql.end();
