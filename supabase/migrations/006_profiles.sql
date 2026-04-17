-- Kitchen Inventory — Phase 4 (Friends): Profiles
-- Run this in your Supabase SQL Editor after 005_cooking_modifications.sql

-- ── Profiles ─────────────────────────────────────────────────
-- A public-facing identity layer that sits 1:1 alongside auth.users.
-- We never expose auth.users directly; all social features reference profiles.id.
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  -- Tracks whether the user has customized their auto-generated username.
  -- Used by middleware to gate them into the onboarding flow on first login.
  username_customized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT username_format CHECK (
    username ~ '^[a-z0-9_]{3,30}$'
  )
);

CREATE INDEX idx_profiles_username ON profiles(username);

-- ── Auto-create profile on user signup ───────────────────────
-- Generates a default username like "user_x8k3mq" that satisfies the format
-- check above. Users must customize it through the onboarding flow.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
  attempts INT := 0;
BEGIN
  -- Try deriving from email local-part first
  base_username := lower(regexp_replace(
    split_part(NEW.email, '@', 1),
    '[^a-z0-9_]', '', 'g'
  ));
  -- Fallback if base ended up too short
  IF length(base_username) < 3 THEN
    base_username := 'user';
  END IF;
  -- Truncate to leave room for a disambiguator
  base_username := substring(base_username FROM 1 FOR 20);

  candidate := base_username || '_' || substring(md5(random()::text), 1, 6);

  -- Retry on collisions (extremely rare with 36^6 space, but safe)
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate) AND attempts < 5 LOOP
    candidate := base_username || '_' || substring(md5(random()::text), 1, 6);
    attempts := attempts + 1;
  END LOOP;

  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NEW.raw_user_meta_data->>'full_name', base_username)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Backfill profiles for existing users ─────────────────────
-- Any users created before this migration get profiles now.
INSERT INTO profiles (id, username, display_name)
SELECT
  u.id,
  'user_' || substring(md5(u.id::text || random()::text), 1, 6) AS username,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view any non-private profile, or their own.
-- Private profiles are still visible (so follow requests can address them),
-- but downstream content RLS (cook_sessions, recipes) will gate actual data.
CREATE POLICY "Profiles are publicly readable"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- No INSERT policy: profiles are only created by the on_auth_user_created
-- trigger, which runs as SECURITY DEFINER and bypasses RLS.

-- No DELETE policy: profile rows are cascaded from auth.users deletion only.

-- ── Avatar storage policies ──────────────────────────────────
-- We reuse the existing meal-photos bucket under a profiles/ prefix.
-- NOTE: Run these only if the meal-photos bucket already exists.

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal-photos'
    AND (storage.foldername(name))[1] = 'profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
