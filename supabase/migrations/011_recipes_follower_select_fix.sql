-- Fix overly-broad follower SELECT on `recipes` (and matching `recipe_ingredients`).
--
-- The original policy used:
--   EXISTS (SELECT 1 FROM cook_sessions WHERE recipe_id = recipes.id)
-- which is true if *anyone* has ever cooked that recipe_id. Combined with
-- `is_accepted_follower(recipes.user_id)`, that can surface another user's
-- library rows in places that do a plain `SELECT * FROM recipes` (e.g. the
-- /recipes page) in ways that are confusing and leave rows undeletable for
-- the viewer (DELETE is still owner-only).
--
-- Correct contract (matches the product plan): a follower may read a recipe
-- only if the *recipe owner* has completed at least one cook session for it.
--
-- Also wrap auth.uid() as (SELECT auth.uid()) per Supabase guidance so JWT
-- identity is evaluated reliably inside SECURITY DEFINER helpers.

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

DROP POLICY IF EXISTS "Followers can view cooked recipes" ON public.recipes;
CREATE POLICY "Followers can view cooked recipes"
  ON public.recipes FOR SELECT
  USING (
    is_accepted_follower(user_id)
    AND EXISTS (
      SELECT 1
      FROM public.cook_sessions cs
      WHERE cs.recipe_id = recipes.id
        AND cs.user_id = recipes.user_id
        AND cs.completed_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Followers can view ingredients of visible recipes" ON public.recipe_ingredients;
CREATE POLICY "Followers can view ingredients of visible recipes"
  ON public.recipe_ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND is_accepted_follower(r.user_id)
        AND EXISTS (
          SELECT 1
          FROM public.cook_sessions cs
          WHERE cs.recipe_id = r.id
            AND cs.user_id = r.user_id
            AND cs.completed_at IS NOT NULL
        )
    )
  );
