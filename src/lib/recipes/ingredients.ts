import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeIngredient } from "@/lib/types";

/**
 * Resolve a list of user-facing ingredient rows into `recipe_ingredients`
 * insertable rows, creating `ingredients` entries as needed. Mirrors the
 * lookup-or-create logic already used by POST /api/recipes and is shared
 * between PATCH /api/recipes/[id] and POST /api/recipes/[id]/iterate.
 */
export async function resolveIngredientRows(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  ingredients: RecipeIngredient[]
) {
  const rows: Array<{
    recipe_id: string;
    ingredient_id: string;
    amount: string | null;
    unit: string | null;
    notes: string | null;
    order_index: number;
  }> = [];

  let orderIndex = 0;
  for (const ing of ingredients) {
    const name = ing.name?.trim();
    if (!name) continue;
    const normalized = name.toLowerCase();

    const { data: existing } = await supabase
      .from("ingredients")
      .select("id")
      .eq("name", normalized)
      .or(`created_by.eq.${userId},created_by.is.null`)
      .order("created_by", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ingredientId: string;
    if (existing) {
      ingredientId = existing.id as string;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("ingredients")
        .insert({ name: normalized, created_by: userId })
        .select("id")
        .single();
      if (createErr || !created) {
        throw createErr ?? new Error("Failed to create ingredient");
      }
      ingredientId = created.id as string;
    }

    rows.push({
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      amount: ing.amount?.trim() || null,
      unit: ing.unit?.trim() || null,
      notes: ing.notes?.trim() || null,
      order_index: orderIndex++,
    });
  }

  return rows;
}
