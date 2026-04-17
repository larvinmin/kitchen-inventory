-- Kitchen Inventory — Phase 4 (Friends): Feed visibility
-- Run this in your Supabase SQL Editor after 007_follows.sql

-- This migration adds *additive* SELECT policies so accepted followers can read
-- another user's cook log and the recipes that back it. We never relax the
-- existing owner-only policies; we just add a second SELECT that grants extra
-- visibility when an accepted follow exists.
--
-- Privacy contract:
--   • cook_sessions:       visible to followers
--   • cook_substitutions:  visible to followers (mirrors session visibility)
--   • recipes:             visible to followers ONLY if the recipe has been
--                          cooked at least once. Uncooked drafts stay private.
--   • recipe_ingredients:  visible whenever the parent recipe is visible
--   • inventory / grocery: NOT shared (no extra policies)

-- ── Helper: is auth.uid() an accepted follower of target_user? ──
CREATE OR REPLACE FUNCTION is_accepted_follower(target_user UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = (SELECT auth.uid())
      AND followee_id = target_user
      AND status = 'accepted'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_accepted_follower(UUID) TO authenticated;

-- NOTE: Postgres has no `CREATE OR REPLACE POLICY`, so each policy is
-- preceded by `DROP POLICY IF EXISTS` to keep this migration idempotent
-- (safe to re-run after a tweak without the SQL editor erroring out).

-- ── cook_sessions: followers can SELECT ──────────────────────
DROP POLICY IF EXISTS "Followers can view cook sessions" ON cook_sessions;
CREATE POLICY "Followers can view cook sessions"
  ON cook_sessions FOR SELECT
  USING (is_accepted_follower(user_id));

-- ── cook_substitutions: followers can SELECT ─────────────────
DROP POLICY IF EXISTS "Followers can view cook substitutions" ON cook_substitutions;
CREATE POLICY "Followers can view cook substitutions"
  ON cook_substitutions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cook_sessions cs
      WHERE cs.id = cook_substitutions.cook_session_id
        AND is_accepted_follower(cs.user_id)
    )
  );

-- ── recipes: followers can SELECT cooked recipes only ────────
-- Must be cooked by the *recipe owner* (not merely referenced by any session),
-- otherwise visibility leaks into generic `SELECT * FROM recipes` lists.
DROP POLICY IF EXISTS "Followers can view cooked recipes" ON recipes;
CREATE POLICY "Followers can view cooked recipes"
  ON recipes FOR SELECT
  USING (
    is_accepted_follower(user_id)
    AND EXISTS (
      SELECT 1
      FROM cook_sessions cs
      WHERE cs.recipe_id = recipes.id
        AND cs.user_id = recipes.user_id
        AND cs.completed_at IS NOT NULL
    )
  );

-- ── recipe_ingredients: visible whenever parent recipe is visible ──
-- Note: the existing recipe-owner policy on recipe_ingredients already covers
-- the owner case. We add a follower path that defers to the recipe SELECT
-- policy via a sub-EXISTS — the sub-query is itself RLS-filtered, so if the
-- viewer can't see the recipe they can't see its ingredients either.
DROP POLICY IF EXISTS "Followers can view ingredients of visible recipes" ON recipe_ingredients;
CREATE POLICY "Followers can view ingredients of visible recipes"
  ON recipe_ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND is_accepted_follower(r.user_id)
        AND EXISTS (
          SELECT 1
          FROM cook_sessions cs
          WHERE cs.recipe_id = r.id
            AND cs.user_id = r.user_id
            AND cs.completed_at IS NOT NULL
        )
    )
  );
