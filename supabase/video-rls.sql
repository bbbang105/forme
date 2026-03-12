-- video_sources RLS
ALTER TABLE video_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video sources"
  ON video_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- video_items RLS
ALTER TABLE video_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video items"
  ON video_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- video_bookmark_collections RLS
ALTER TABLE video_bookmark_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video bookmark collections"
  ON video_bookmark_collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
