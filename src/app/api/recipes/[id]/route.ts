import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RecipeIngredient } from "@/lib/types";
import { resolveIngredientRows } from "@/lib/recipes/ingredients";

type EditableRecipeBody = {
  title?: string;
  description?: string | null;
  servings?: string | null;
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  instructions?: string[];
  ingredients?: RecipeIngredient[];
  tags?: string[];
};

/**
 * PATCH /api/recipes/[id]
 *
 * Update an owned recipe in place. Any subset of the top-level fields can be
 * supplied. If `ingredients` is provided we treat it as a full replacement —
 * the existing `recipe_ingredients` rows are deleted and re-inserted to match
 * the payload (simpler and safer than diffing, and these rows are tiny).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as EditableRecipeBody;

  const { data: existing, error: existingErr } = await supabase
    .from("recipes")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (existingErr || !existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recipeUpdate: Record<string, unknown> = {};
  if ("title" in body) recipeUpdate.title = (body.title ?? "").trim() || "Untitled";
  if ("description" in body) recipeUpdate.description = body.description ?? null;
  if ("servings" in body) recipeUpdate.servings = body.servings ?? null;
  if ("prepTime" in body) recipeUpdate.prep_time = body.prepTime ?? null;
  if ("cookTime" in body) recipeUpdate.cook_time = body.cookTime ?? null;
  if ("totalTime" in body) recipeUpdate.total_time = body.totalTime ?? null;
  if ("instructions" in body)
    recipeUpdate.instructions = (body.instructions ?? []).filter((s) => s.trim());
  if ("tags" in body)
    recipeUpdate.tags = (body.tags ?? []).map((t) => t.trim()).filter(Boolean);

  if (Object.keys(recipeUpdate).length > 0) {
    const { error: updateErr } = await supabase
      .from("recipes")
      .update(recipeUpdate)
      .eq("id", id)
      .eq("user_id", user.id);
    if (updateErr) {
      console.error("Recipe PATCH failed:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  if (body.ingredients) {
    // Full replacement. `cook_substitutions.original_recipe_ingredient_id` FK
    // is ON DELETE SET NULL, so historical cook sessions that referenced the
    // old rows simply lose the back-pointer — they keep their literal
    // ingredient-name/amount snapshots from when the user cooked it.
    const { error: delErr } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", id);
    if (delErr) {
      console.error("Recipe PATCH ingredients wipe failed:", delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    try {
      const rows = await resolveIngredientRows(
        supabase,
        user.id,
        id,
        body.ingredients
      );
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("recipe_ingredients")
          .insert(rows);
        if (insErr) {
          console.error("Recipe PATCH ingredients insert failed:", insErr);
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ingredient resolve failed";
      console.error("Recipe PATCH ingredient resolve failed:", err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, id });
}
