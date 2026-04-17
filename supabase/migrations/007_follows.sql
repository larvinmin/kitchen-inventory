-- Kitchen Inventory — Phase 4 (Friends): Follows
-- Run this in your Supabase SQL Editor after 006_profiles.sql

-- ── Follows ──────────────────────────────────────────────────
-- Asymmetric follow graph (Instagram model). A row exists per follow attempt.
-- For PUBLIC followees, status flips to 'accepted' immediately via the trigger
-- below. For PRIVATE followees, it stays 'pending' until the followee patches
-- it via /api/follows/:id.
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id, status);
CREATE INDEX idx_follows_followee ON follows(followee_id, status);

-- ── Auto-accept trigger for public profiles ──────────────────
-- When INSERTing a follow row, if the followee's profile is public, we
-- auto-accept. This keeps the API simple — it can always insert with default
-- status, and the trigger does the right thing based on the followee's privacy.
CREATE OR REPLACE FUNCTION auto_accept_follow()
RETURNS TRIGGER AS $$
DECLARE
  followee_private BOOLEAN;
BEGIN
  SELECT is_private INTO followee_private
  FROM profiles
  WHERE id = NEW.followee_id;

  IF NOT followee_private THEN
    NEW.status := 'accepted';
    NEW.accepted_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER follows_auto_accept
  BEFORE INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION auto_accept_follow();

-- ── Stamp accepted_at on transition ──────────────────────────
-- Catches the manual-accept path (followee patching status to accepted).
CREATE OR REPLACE FUNCTION stamp_follow_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    NEW.accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER follows_stamp_accepted
  BEFORE UPDATE OF status ON follows
  FOR EACH ROW EXECUTE FUNCTION stamp_follow_accepted_at();

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- A user can read any follow row that involves them (sent or received).
-- Counts of followers/following on public profile pages are computed via
-- a SECURITY DEFINER helper (see below) so non-participants get totals only.
CREATE POLICY "Users can view their own follow rows"
  ON follows FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = followee_id);

-- Only the follower may create the row, and only addressed to someone else.
CREATE POLICY "Users can create their own follow rows"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Only the followee may flip status (accept). Followers update via DELETE +
-- re-INSERT pattern instead of mutating their own pending row.
CREATE POLICY "Followee can update follow status"
  ON follows FOR UPDATE
  USING (auth.uid() = followee_id);

-- Either side can tear it down (unfollow / cancel-request / decline / remove).
CREATE POLICY "Either party can delete the follow row"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = followee_id);

-- ── Public follow counts helper ──────────────────────────────
-- RLS hides rows the viewer isn't part of, so we expose aggregate counts via
-- a SECURITY DEFINER function. Used by the public profile page.
CREATE OR REPLACE FUNCTION public_follow_counts(target_id UUID)
RETURNS TABLE (followers_count BIGINT, following_count BIGINT) AS $$
  SELECT
    (SELECT COUNT(*) FROM follows WHERE followee_id = target_id AND status = 'accepted') AS followers_count,
    (SELECT COUNT(*) FROM follows WHERE follower_id = target_id AND status = 'accepted') AS following_count;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public_follow_counts(UUID) TO authenticated;
