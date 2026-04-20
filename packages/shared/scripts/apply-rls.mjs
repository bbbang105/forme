import {config} from 'dotenv';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const statements = [
  // Sources RLS
  `ALTER TABLE curation_sources ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "sources_select" ON curation_sources`,
  `DROP POLICY IF EXISTS "sources_insert" ON curation_sources`,
  `DROP POLICY IF EXISTS "sources_update" ON curation_sources`,
  `DROP POLICY IF EXISTS "sources_delete" ON curation_sources`,
  `CREATE POLICY "sources_select" ON curation_sources FOR SELECT USING (auth.uid() = user_id)`,
  `CREATE POLICY "sources_insert" ON curation_sources FOR INSERT WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "sources_update" ON curation_sources FOR UPDATE USING (auth.uid() = user_id)`,
  `CREATE POLICY "sources_delete" ON curation_sources FOR DELETE USING (auth.uid() = user_id)`,
  // Items RLS
  `ALTER TABLE curation_items ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "items_select" ON curation_items`,
  `DROP POLICY IF EXISTS "items_update" ON curation_items`,
  `DROP POLICY IF EXISTS "items_delete" ON curation_items`,
  `CREATE POLICY "items_select" ON curation_items FOR SELECT USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()))`,
  `CREATE POLICY "items_update" ON curation_items FOR UPDATE USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()))`,
  `CREATE POLICY "items_delete" ON curation_items FOR DELETE USING (EXISTS (SELECT 1 FROM curation_sources WHERE id = source_id AND user_id = auth.uid()))`,
  // Push Subscriptions RLS
  `ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "push_subs_select" ON push_subscriptions`,
  `DROP POLICY IF EXISTS "push_subs_insert" ON push_subscriptions`,
  `DROP POLICY IF EXISTS "push_subs_update" ON push_subscriptions`,
  `DROP POLICY IF EXISTS "push_subs_delete" ON push_subscriptions`,
  `CREATE POLICY "push_subs_select" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id)`,
  `CREATE POLICY "push_subs_insert" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "push_subs_update" ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id)`,
  `CREATE POLICY "push_subs_delete" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id)`,
  // Extra index
  `CREATE INDEX IF NOT EXISTS idx_items_bookmarked ON curation_items(is_bookmarked) WHERE is_bookmarked = true`,
];

for (const stmt of statements) {
  await sql.unsafe(stmt);
}
console.log('All RLS policies and indexes applied successfully');
await sql.end();
