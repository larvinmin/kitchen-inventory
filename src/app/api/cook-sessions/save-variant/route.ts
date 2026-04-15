import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cook-sessions/save-variant
 *
 * Creates a recipe variant (offshoot) from a cook session's substitutions.
 * The variant is a full recipe linked to the original via parent_recipe_id.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await request.json();

  // Fetch the session with substitutions and recipe
  const { data: session, error: fetchError } = await supabase
    .from("cook_sessions")
    .select(
      `
      *,
      recipes!cook_sessions_recipe_id_fkey (*),
      cook_substitutions (*)
    `
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  if (session.variant_recipe_id) {
    return NextResponse.json(
      { error: "Variant already exists for this session" },
      { status: 400 }
    );
  }

  const originalRecipe = session.recipes;
  const substitutions = session.cook_substitutions || [];

  if (substitutions.length === 0) {
    return NextResponse.json(
      { error: "No substitutions to create a variant from" },
      { status: 400 }
    );
  }

  // Build substitution name suffix
  const subNames = substitutions
    .map((s: { substitute_ingredient_name: string }) => s.substitute_ingredient_name)
    .slice(0, 3)
    .join(", ");
  const variantTitle = `${originalRecipe.title} (with ${subNames})`;

  // Create the variant recipe
  const { data: variantRecipe, error: createError } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: variantTitle,
      description: originalRecipe.description,
      servings: originalRecipe.servings,
      prep_time: originalRecipe.prep_time,
      cook_time: originalRecipe.cook_time,
      total_time: originalRecipe.total_time,
      instructions: originalRecipe.instructions,
      tags: originalRecipe.tags,
      source_url: originalRecipe.source_url,
      source_platform: originalRecipe.source_platform,
      source_thumbnail: originalRecipe.source_thumbnail,
      parent_recipe_id: originalRecipe.id,
    })
    .select()
    .single();

  if (createError || !variantRecipe) {
    console.error("Failed to create variant recipe:", createError);
    return NextResponse.json(
      { error: "Failed to create variant" },
      { status: 500 }
    );
  }

  // Copy ingredients from original, applying substitutions
  const { data: originalIngredients } = await supabase
    .from("recipe_ingredients")
    .select("*, ingredients (*)")
    .eq("recipe_id", originalRecipe.id)
    .order("order_index");

  if (originalIngredients) {
    for (const ri of originalIngredients) {
      // Check if this ingredient was substituted
      const sub = substitutions.find(
        (s: { original_recipe_ingredient_id: string | null }) =>
          s.original_recipe_ingredient_id === ri.id
      );

      if (sub) {
        // Find or create the substitute ingredient
        let ingredientId: string;
        const { data: existing } = await supabase
          .from("ingredients")
          .select("id")
          .eq("name", sub.substitute_ingredient_name)
          .maybeSingle();

        if (existing) {
          ingredientId = existing.id;
        } else {
          const { data: newIng } = await supabase
            .from("ingredients")
            .insert({
              name: sub.substitute_ingredient_name,
              created_by: user.id,
            })
            .select("id")
            .single();

          ingredientId = newIng!.id;
        }

        await supabase.from("recipe_ingredients").insert({
          recipe_id: variantRecipe.id,
          ingredient_id: ingredientId,
          amount: sub.substitute_amount || ri.amount,
          unit: sub.substitute_unit || ri.unit,
          notes: sub.substitute_notes || null,
          order_index: ri.order_index,
        });
      } else {
        // Copy as-is
        await supabase.from("recipe_ingredients").insert({
          recipe_id: variantRecipe.id,
          ingredient_id: ri.ingredient_id,
          amount: ri.amount,
          unit: ri.unit,
          notes: ri.notes,
          order_index: ri.order_index,
        });
      }
    }
  }

  // Link the variant to the cook session
  await supabase
    .from("cook_sessions")
    .update({ variant_recipe_id: variantRecipe.id })
    .eq("id", sessionId);

  return NextResponse.json(
    { variant: variantRecipe },
    { status: 201 }
  );
}
