-- youtube_sources RLS
ALTER TABLE youtube_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own youtube sources"
  ON youtube_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- youtube_items RLS
ALTER TABLE youtube_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own youtube items"
  ON youtube_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
