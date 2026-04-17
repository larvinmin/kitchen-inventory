-- Kitchen Inventory — Decouple cook sessions from recipes
--
-- Problem
-- -------
-- `cook_sessions.recipe_id` was declared `NOT NULL` with `ON DELETE CASCADE`,
-- so deleting a recipe wiped out the user's cook history (and any feed posts
-- backed by that history). A recipe lives in your *library* — what you might
-- want to cook again — while a cook session is a *historical event* that
-- happened. Removing a recipe from the library should NOT erase the fact
-- that you once cooked it.
--
-- Fix
-- ---
-- 1. Add denormalized snapshot columns to `cook_sessions` (title, thumbnail,
--    tags) so the cook log can render even when the recipe is gone. We
--    snapshot at write-time, which also means renaming a recipe later does
--    not retroactively rewrite history.
-- 2. Backfill snapshots for existing rows from the live `recipes` rows.
-- 3. Make `recipe_id` nullable and switch the FK from CASCADE to SET NULL.
-- 4. Add a BEFORE INSERT/UPDATE trigger that auto-populates the snapshot any
--    time a non-null `recipe_id` is set.
--
-- Re-runnable: every step uses IF NOT EXISTS / DROP IF EXISTS guards.

-- ── 1. Snapshot columns ───────────────────────────────────────
ALTER TABLE cook_sessions
  ADD COLUMN IF NOT EXISTS recipe_title TEXT,
  ADD COLUMN IF NOT EXISTS recipe_thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS recipe_tags TEXT[];

-- ── 2. Backfill from current recipes ──────────────────────────
UPDATE cook_sessions cs
SET
  recipe_title     = r.title,
  recipe_thumbnail = r.source_thumbnail,
  recipe_tags      = r.tags
FROM recipes r
WHERE cs.recipe_id = r.id
  AND cs.recipe_title IS NULL;

-- Defensive fallback for any orphaned legacy rows (shouldn't exist, but
-- keeps the column meaningful even if a row somehow lost its recipe before
-- this migration ran).
UPDATE cook_sessions
SET recipe_title = '(unknown recipe)'
WHERE recipe_title IS NULL;

-- ── 3. Allow recipe_id to be null ─────────────────────────────
ALTER TABLE cook_sessions ALTER COLUMN recipe_id DROP NOT NULL;

-- ── 4. Switch FK behaviour: CASCADE → SET NULL ────────────────
ALTER TABLE cook_sessions DROP CONSTRAINT IF EXISTS cook_sessions_recipe_id_fkey;
ALTER TABLE cook_sessions
  ADD CONSTRAINT cook_sessions_recipe_id_fkey
  FOREIGN KEY (recipe_id)
  REFERENCES recipes(id)
  ON DELETE SET NULL;

-- ── 5. Snapshot trigger ───────────────────────────────────────
-- Fires whenever a cook_session is inserted, or whenever its recipe_id
-- column is updated to a non-null value. We deliberately do NOT touch the
-- snapshot when the FK clears itself to NULL (that's the recipe-deleted
-- path — we want the snapshot to survive).
CREATE OR REPLACE FUNCTION snapshot_cook_session_recipe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title TEXT;
  v_thumb TEXT;
  v_tags  TEXT[];
BEGIN
  IF NEW.recipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT')
     OR (NEW.recipe_id IS DISTINCT FROM OLD.recipe_id) THEN
    SELECT title, source_thumbnail, tags
      INTO v_title, v_thumb, v_tags
    FROM public.recipes
    WHERE id = NEW.recipe_id;

    IF v_title IS NOT NULL THEN
      NEW.recipe_title     := v_title;
      NEW.recipe_thumbnail := v_thumb;
      NEW.recipe_tags      := v_tags;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cook_sessions_snapshot_recipe ON cook_sessions;
CREATE TRIGGER trg_cook_sessions_snapshot_recipe
BEFORE INSERT OR UPDATE OF recipe_id ON cook_sessions
FOR EACH ROW EXECUTE FUNCTION snapshot_cook_session_recipe();
