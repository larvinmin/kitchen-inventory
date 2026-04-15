-- Phase 3: Dynamic Cooking Modifications
-- Run this in your Supabase SQL Editor

-- 1. Add modified_instructions to cook_sessions
ALTER TABLE cook_sessions ADD COLUMN modified_instructions JSONB DEFAULT NULL;

-- 2. Add sub_type and audit fields to cook_substitutions
-- First, define the type if it doesn't exist (using a check constraint is simpler for migrations)
ALTER TABLE cook_substitutions ADD COLUMN sub_type TEXT CHECK (sub_type IN ('swap', 'addition', 'deletion')) DEFAULT 'swap';

-- 3. Relax constraints on original ingredient name (for additions)
ALTER TABLE cook_substitutions ALTER COLUMN original_ingredient_name DROP NOT NULL;
