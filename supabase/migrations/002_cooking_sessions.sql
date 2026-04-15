-- Kitchen Inventory — Phase 2: Cooking Sessions & Ranking
-- Run this in your Supabase SQL Editor after 001_initial_schema.sql

-- ── Add parent_recipe_id to recipes (for variants/offshoots) ─
ALTER TABLE recipes ADD COLUMN parent_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
CREATE INDEX idx_recipes_parent ON recipes(parent_recipe_id);

-- ── Cook Sessions ────────────────────────────────────────────
CREATE TABLE cook_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  -- If the user cooked with substitutions and saved a variant
  variant_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  notes TEXT,
  photo_url TEXT,
  -- Beli-style rating
  rating_category TEXT CHECK (rating_category IN ('bad', 'ok', 'good')),
  rating_rank INTEGER, -- position within category (0 = best in category)
  rating_score REAL,   -- computed 0-10 score from bell curve position
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Cook Substitutions ──────────────────────────────────────
-- Each row = one ingredient swap during a cooking session
CREATE TABLE cook_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_session_id UUID REFERENCES cook_sessions(id) ON DELETE CASCADE NOT NULL,
  -- Original ingredient reference
  original_recipe_ingredient_id UUID REFERENCES recipe_ingredients(id) ON DELETE SET NULL,
  original_ingredient_name TEXT NOT NULL,
  original_amount TEXT,
  original_unit TEXT,
  -- What the user substituted
  substitute_ingredient_name TEXT NOT NULL,
  substitute_amount TEXT,
  substitute_unit TEXT,
  substitute_notes TEXT
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_cook_sessions_user ON cook_sessions(user_id);
CREATE INDEX idx_cook_sessions_recipe ON cook_sessions(recipe_id);
CREATE INDEX idx_cook_sessions_category ON cook_sessions(user_id, rating_category);
CREATE INDEX idx_cook_sessions_score ON cook_sessions(user_id, rating_score DESC);
CREATE INDEX idx_cook_substitutions_session ON cook_substitutions(cook_session_id);

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE cook_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cook sessions"
  ON cook_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cook sessions"
  ON cook_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cook sessions"
  ON cook_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cook sessions"
  ON cook_sessions FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE cook_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cook substitutions"
  ON cook_substitutions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cook_sessions
      WHERE cook_sessions.id = cook_substitutions.cook_session_id
      AND cook_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cook substitutions"
  ON cook_substitutions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cook_sessions
      WHERE cook_sessions.id = cook_substitutions.cook_session_id
      AND cook_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own cook substitutions"
  ON cook_substitutions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cook_sessions
      WHERE cook_sessions.id = cook_substitutions.cook_session_id
      AND cook_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cook substitutions"
  ON cook_substitutions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cook_sessions
      WHERE cook_sessions.id = cook_substitutions.cook_session_id
      AND cook_sessions.user_id = auth.uid()
    )
  );

-- ── Storage bucket for meal photos ──────────────────────────
-- NOTE: You also need to create a "meal-photos" bucket in the
-- Supabase dashboard → Storage → New Bucket (set to public).
-- Then add this policy in the SQL editor:

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload meal photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow anyone to read meal photos (for display)
CREATE POLICY "Public can view meal photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meal-photos');

-- Allow users to delete their own photos
CREATE POLICY "Users can delete own meal photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
