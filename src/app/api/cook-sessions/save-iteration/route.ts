import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cook-sessions/save-iteration
 *
 * Creates a recipe iteration (offshoot) from a cook session's substitutions.
 * The iteration is a full recipe linked to the original via parent_recipe_id.
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
      { error: "Iteration already exists for this session" },
      { status: 400 }
    );
  }

  const originalRecipe = session.recipes;
  const substitutions = session.cook_substitutions || [];
  const modifiedInstructions = session.modified_instructions;

  // Build iteration title from substitution names
  let iterationTitle = originalRecipe.title;
  if (substitutions.length > 0) {
    const subNames = substitutions
      .filter((s: any) => s.sub_type !== "deletion")
      .map((s: { substitute_ingredient_name: string }) => s.substitute_ingredient_name)
      .slice(0, 3)
      .join(", ");
    iterationTitle = `${originalRecipe.title} (Iterated with ${subNames || "changes"})`;
  }

  // Create the iteration recipe
  const { data: iterationRecipe, error: createError } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: iterationTitle,
      description: originalRecipe.description,
      servings: originalRecipe.servings,
      prep_time: originalRecipe.prep_time,
      cook_time: originalRecipe.cook_time,
      total_time: originalRecipe.total_time,
      instructions: modifiedInstructions || originalRecipe.instructions,
      tags: originalRecipe.tags,
      source_url: originalRecipe.source_url,
      source_platform: originalRecipe.source_platform,
      source_thumbnail: originalRecipe.source_thumbnail,
      parent_recipe_id: originalRecipe.id,
    })
    .select()
    .single();

  if (createError || !iterationRecipe) {
    console.error("Failed to create iteration recipe:", createError);
    return NextResponse.json(
      { error: "Failed to create iteration" },
      { status: 500 }
    );
  }

  // Copy ingredients logic
  const { data: originalIngredients } = await supabase
    .from("recipe_ingredients")
    .select("*, ingredients (*)")
    .eq("recipe_id", originalRecipe.id)
    .order("order_index");

  let currentOrder = 0;

  // 1. Handle original ingredients (copy as-is, swap, or skip if deleted)
  if (originalIngredients) {
    for (const ri of originalIngredients) {
      const sub = substitutions.find(
        (s: { original_recipe_ingredient_id: string | null; sub_type: string }) =>
          s.original_recipe_ingredient_id === ri.id
      );

      if (sub) {
        if (sub.sub_type === "deletion") {
          // Skip this ingredient entirely
          continue;
        }

        // It was a swap — use the substitute
        const ingredientId = await getOrCreateIngredient(supabase, user.id, sub.substitute_ingredient_name);
        await supabase.from("recipe_ingredients").insert({
          recipe_id: iterationRecipe.id,
          ingredient_id: ingredientId,
          amount: sub.substitute_amount || ri.amount,
          unit: sub.substitute_unit || ri.unit,
          notes: sub.substitute_notes || null,
          order_index: currentOrder++,
        });
      } else {
        // Copy as-is
        await supabase.from("recipe_ingredients").insert({
          recipe_id: iterationRecipe.id,
          ingredient_id: ri.ingredient_id,
          amount: ri.amount,
          unit: ri.unit,
          notes: ri.notes,
          order_index: currentOrder++,
        });
      }
    }
  }

  // 2. Handle additions (new ingredients not in the original recipe)
  const additions = substitutions.filter((s: any) => s.sub_type === "addition");
  for (const add of additions) {
    const ingredientId = await getOrCreateIngredient(supabase, user.id, add.substitute_ingredient_name);
    await supabase.from("recipe_ingredients").insert({
      recipe_id: iterationRecipe.id,
      ingredient_id: ingredientId,
      amount: add.substitute_amount || null,
      unit: add.substitute_unit || null,
      notes: add.substitute_notes || null,
      order_index: currentOrder++,
    });
  }

  // Link the iteration to the cook session
  await supabase
    .from("cook_sessions")
    .update({ variant_recipe_id: iterationRecipe.id })
    .eq("id", sessionId);

  return NextResponse.json(
    { iteration: iterationRecipe },
    { status: 201 }
  );
}

async function getOrCreateIngredient(supabase: any, userId: string, name: string) {
  const normalizedName = name.toLowerCase().trim();
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id")
    .eq("name", normalizedName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newIng } = await supabase
    .from("ingredients")
    .insert({
      name: normalizedName,
      created_by: userId,
    })
    .select("id")
    .single();

  return newIng!.id;
}
