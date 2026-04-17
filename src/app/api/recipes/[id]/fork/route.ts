import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * POST /api/recipes/[id]/fork
 *
 * Deep-copies a recipe (and its ingredients) into the signed-in user's library
 * with `parent_recipe_id` set to the original. Used by the feed and friend
 * profile pages — the "Save to my library" / "View their version" loop.
 *
 * RLS makes the source recipe readable to us (since we follow the author and
 * they've cooked it at least once, per the migration 008 policy). We then
 * INSERT under our own user_id which the existing recipe-owner policy permits.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the source recipe (RLS will hide it if not visible to us).
  const { data: source, error: sourceErr } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (sourceErr || !source) {
    return NextResponse.json(
      { error: "Recipe not found or not visible to you" },
      { status: 404 }
    );
  }

  if (source.user_id === user.id) {
    return NextResponse.json(
      { error: "This is already your recipe" },
      { status: 400 }
    );
  }

  // Avoid duplicate forks: if the user already forked this exact source,
  // return the existing copy instead of creating another one.
  const { data: existing } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", user.id)
    .eq("parent_recipe_id", source.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ recipe: existing, deduped: true });
  }

  // Insert the copy under the current user.
  const { data: copy, error: copyErr } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: source.title,
      description: source.description,
      servings: source.servings,
      prep_time: source.prep_time,
      cook_time: source.cook_time,
      total_time: source.total_time,
      instructions: source.instructions,
      tags: source.tags,
      source_url: source.source_url,
      source_platform: source.source_platform,
      source_thumbnail: source.source_thumbnail,
      parent_recipe_id: source.id,
    })
    .select()
    .single();

  if (copyErr || !copy) {
    console.error("Recipe fork failed:", copyErr);
    return NextResponse.json(
      { error: copyErr?.message || "Failed to fork recipe" },
      { status: 500 }
    );
  }

  // Copy ingredients. Ingredient rows themselves are global (RLS allows SELECT
  // for any authenticated user), so we can reuse the same ingredient_id.
  const { data: sourceIngredients } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id, amount, unit, notes, order_index")
    .eq("recipe_id", source.id)
    .order("order_index");

  if (sourceIngredients && sourceIngredients.length > 0) {
    const rows = sourceIngredients.map((ri) => ({
      recipe_id: copy.id,
      ingredient_id: ri.ingredient_id,
      amount: ri.amount,
      unit: ri.unit,
      notes: ri.notes,
      order_index: ri.order_index,
    }));
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(rows);

    if (ingErr) {
      // Best-effort cleanup so we don't leave an empty recipe behind.
      await rollback(supabase, copy.id);
      console.error("Recipe fork ingredients failed:", ingErr);
      return NextResponse.json(
        { error: ingErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ recipe: copy }, { status: 201 });
}

async function rollback(supabase: SupabaseClient, recipeId: string) {
  await supabase.from("recipes").delete().eq("id", recipeId);
}
