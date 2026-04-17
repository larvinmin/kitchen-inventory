-- Kitchen Inventory — Phase 4 (Friends): Notifications
-- Run this in your Supabase SQL Editor after 008_feed_visibility.sql

-- ── Notifications ────────────────────────────────────────────
-- Polymorphic notifications table. `subject_id` is the id of the entity the
-- notification is *about* (the follow row, the cook session, or the recipe);
-- `metadata` holds denormalized snippets so the dropdown UI can render rows
-- without joins, which keeps Realtime delivery latency low.
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('follow_request', 'follow_accepted', 'recipe_cooked')
  ),
  subject_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_recipient
  ON notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread
  ON notifications(recipient_id) WHERE read_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read and update (mark-read) their own.
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = recipient_id);

-- No INSERT policy — rows are produced exclusively by the SECURITY DEFINER
-- triggers below.

-- ── Trigger 1: follow created → notify followee ──────────────
CREATE OR REPLACE FUNCTION notify_on_follow_inserted()
RETURNS TRIGGER AS $$
DECLARE
  actor_profile profiles%ROWTYPE;
  notif_type TEXT;
BEGIN
  SELECT * INTO actor_profile FROM profiles WHERE id = NEW.follower_id;

  IF NEW.status = 'accepted' THEN
    -- Public-profile auto-accept path: tell the followee they've gained a follower.
    notif_type := 'follow_accepted';
  ELSE
    notif_type := 'follow_request';
  END IF;

  INSERT INTO notifications (recipient_id, actor_id, type, subject_id, metadata)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER follows_notify_on_insert
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow_inserted();

-- ── Trigger 2: pending → accepted → notify the original requester ──
CREATE OR REPLACE FUNCTION notify_on_follow_accepted()
RETURNS TRIGGER AS $$
DECLARE
  actor_profile profiles%ROWTYPE;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- "Actor" from the requester's perspective is the followee who accepted.
    SELECT * INTO actor_profile FROM profiles WHERE id = NEW.followee_id;

    INSERT INTO notifications (recipient_id, actor_id, type, subject_id, metadata)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER follows_notify_on_accept
  AFTER UPDATE OF status ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow_accepted();

-- ── Trigger 3: cook session completed → notify the recipe's root author ──
-- Walks the parent_recipe_id chain (capped at 10 hops) so cooks of a forked
-- recipe still credit the original author. Only fires when completed_at flips
-- from NULL → not-NULL, so unfinished sessions never spam authors.
CREATE OR REPLACE FUNCTION notify_recipe_cooked()
RETURNS TRIGGER AS $$
DECLARE
  cooker_profile profiles%ROWTYPE;
  recipe_row recipes%ROWTYPE;
  root_recipe recipes%ROWTYPE;
  hop_count INT := 0;
BEGIN
  -- Only on transition to completed; ignore later edits/reorders.
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO recipe_row FROM recipes WHERE id = NEW.recipe_id;
  IF recipe_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Walk up the fork chain to find the root author.
  root_recipe := recipe_row;
  WHILE root_recipe.parent_recipe_id IS NOT NULL AND hop_count < 10 LOOP
    SELECT * INTO root_recipe FROM recipes WHERE id = root_recipe.parent_recipe_id;
    EXIT WHEN root_recipe.id IS NULL;
    hop_count := hop_count + 1;
  END LOOP;

  -- Don't notify the cook about themselves.
  IF root_recipe.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cooker_profile FROM profiles WHERE id = NEW.user_id;

  INSERT INTO notifications (recipient_id, actor_id, type, subject_id, metadata)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER cook_sessions_notify_author
  AFTER INSERT OR UPDATE OF completed_at ON cook_sessions
  FOR EACH ROW EXECUTE FUNCTION notify_recipe_cooked();

-- ── Realtime: enable change replication ─────────────────────
-- IMPORTANT: For the NotificationBell's Supabase Realtime subscription to
-- fire, this table must be added to the supabase_realtime publication.
-- This statement is idempotent on Supabase.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
