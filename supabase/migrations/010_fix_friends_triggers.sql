-- Kitchen Inventory — Fix-up for migrations 006–009
-- Run this in your Supabase SQL Editor after 009_notifications.sql
--
-- Two classes of fixes:
--   1. SECURITY DEFINER functions need an explicit `search_path`. Supabase
--      strips it from the function owner's session by default, so unqualified
--      table references (e.g. `profiles`) fail with "relation does not exist"
--      and surface to the client as "Database error saving new user".
--   2. handle_new_user() must be NULL-safe on `NEW.email` for OAuth/magic-link
--      flows where the email metadata may not be present at trigger time.

-- ── handle_new_user: harden + qualify ────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  email_local TEXT;
  base_username TEXT;
  candidate TEXT;
  attempts INT := 0;
BEGIN
  -- Derive a base from the email local-part. NEW.email may be NULL for
  -- some auth providers, so guard everything in COALESCE.
  email_local := COALESCE(split_part(NEW.email, '@', 1), '');
  base_username := lower(regexp_replace(email_local, '[^a-z0-9_]', '', 'g'));

  IF base_username IS NULL OR length(base_username) < 3 THEN
    base_username := 'user';
  END IF;

  base_username := substring(base_username FROM 1 FOR 20);

  candidate := base_username || '_' || substring(md5(random()::text || NEW.id::text), 1, 6);

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) AND attempts < 5 LOOP
    candidate := base_username || '_' || substring(md5(random()::text || NEW.id::text || attempts::text), 1, 6);
    attempts := attempts + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NEW.raw_user_meta_data->>'full_name', base_username)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block auth signups on profile-creation issues. The middleware
  -- onboarding gate will recover by redirecting to /profile, where the
  -- user can pick a username (and we'll create the row from there if needed).
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ── auto_accept_follow: qualify ──────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_accept_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  followee_private BOOLEAN;
BEGIN
  SELECT is_private INTO followee_private
  FROM public.profiles
  WHERE id = NEW.followee_id;

  IF NOT followee_private THEN
    NEW.status := 'accepted';
    NEW.accepted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ── Notification triggers: qualify ───────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_follow_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_profile public.profiles%ROWTYPE;
  notif_type TEXT;
BEGIN
  SELECT * INTO actor_profile FROM public.profiles WHERE id = NEW.follower_id;

  IF NEW.status = 'accepted' THEN
    notif_type := 'follow_accepted';
  ELSE
    notif_type := 'follow_request';
  END IF;

  INSERT INTO public.notifications (recipient_id, actor_id, type, subject_id, metadata)
  VALUES (
    NEW.followee_id,
    NEW.follower_id,
    notif_type,
    NEW.id,
    jsonb_build_object(
      'actor_username', actor_profile.username,
      'actor_display_name', actor_profile.display_name,
      'actor_avatar_url', actor_profile.avatar_url
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_follow_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_profile public.profiles%ROWTYPE;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT * INTO actor_profile FROM public.profiles WHERE id = NEW.followee_id;

    INSERT INTO public.notifications (recipient_id, actor_id, type, subject_id, metadata)
    VALUES (
      NEW.follower_id,
      NEW.followee_id,
      'follow_accepted',
      NEW.id,
      jsonb_build_object(
        'actor_username', actor_profile.username,
        'actor_display_name', actor_profile.display_name,
        'actor_avatar_url', actor_profile.avatar_url
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_recipe_cooked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cooker_profile public.profiles%ROWTYPE;
  recipe_row public.recipes%ROWTYPE;
  root_recipe public.recipes%ROWTYPE;
  hop_count INT := 0;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO recipe_row FROM public.recipes WHERE id = NEW.recipe_id;
  IF recipe_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  root_recipe := recipe_row;
  WHILE root_recipe.parent_recipe_id IS NOT NULL AND hop_count < 10 LOOP
    SELECT * INTO root_recipe FROM public.recipes WHERE id = root_recipe.parent_recipe_id;
    EXIT WHEN root_recipe.id IS NULL;
    hop_count := hop_count + 1;
  END LOOP;

  IF root_recipe.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cooker_profile FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (recipient_id, actor_id, type, subject_id, metadata)
  VALUES (
    root_recipe.user_id,
    NEW.user_id,
    'recipe_cooked',
    NEW.id,
    jsonb_build_object(
      'actor_username', cooker_profile.username,
      'actor_display_name', cooker_profile.display_name,
      'actor_avatar_url', cooker_profile.avatar_url,
      'recipe_id', root_recipe.id,
      'recipe_title', root_recipe.title,
      'recipe_thumbnail', root_recipe.source_thumbnail,
      'cook_session_id', NEW.id
    )
  );

  RETURN NEW;
END;
$$;

-- ── is_accepted_follower: qualify ────────────────────────────
CREATE OR REPLACE FUNCTION public.is_accepted_follower(target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = (SELECT auth.uid())
      AND followee_id = target_user
      AND status = 'accepted'
  );
$$;

-- ── Allow users to self-insert their profile row ─────────────
-- Lets the app's GET /api/profiles/me lazy-backfill if the auth-trigger
-- happened to fail. Constrained to id=auth.uid() so a user can only create
-- *their own* profile row.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

-- ── public_follow_counts: qualify ────────────────────────────
CREATE OR REPLACE FUNCTION public.public_follow_counts(target_id UUID)
RETURNS TABLE (followers_count BIGINT, following_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.follows WHERE followee_id = target_id AND status = 'accepted') AS followers_count,
    (SELECT COUNT(*) FROM public.follows WHERE follower_id = target_id AND status = 'accepted') AS following_count;
$$;
