import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ParsedRecipe } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recipe = (await request.json()) as ParsedRecipe;

    // Determine source username
    const username = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

    // 1. Insert the recipe
    const { data: recipeRow, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: recipe.title,
        description: recipe.description || null,
        servings: recipe.servings || null,
        prep_time: recipe.prepTime || null,
        cook_time: recipe.cookTime || null,
        total_time: recipe.totalTime || null,
        instructions: recipe.instructions,
        tags: recipe.tags,
        source_url: null,
        source_platform: username, // "source will show as the users username"
        source_thumbnail: null,
      })
      .select("id")
      .single();

    if (recipeError) throw recipeError;

    // 2. Process ingredients
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      if (!ing.name.trim()) continue;

      const normalizedName = ing.name.toLowerCase().trim();

      // Try to find if this ingredient exists (created by us or global)
      let ingredientId: string;
      
      const { data: existing } = await supabase
        .from("ingredients")
        .select("id")
        .eq("name", normalizedName)
        .or(`created_by.eq.${user.id},created_by.is.null`)
        .order('created_by', { ascending: false }) // Favor user-specific if both exist
        .limit(1)
        .maybeSingle();

      if (existing) {
        ingredientId = existing.id;
      } else {
        // Create new ingredient
        const { data: newIng, error: ingError } = await supabase
          .from("ingredients")
          .insert({
            name: normalizedName,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (ingError) throw ingError;
        ingredientId = newIng.id;
      }

      // Link to recipe
      const { error: linkError } = await supabase.from("recipe_ingredients").insert({
        recipe_id: recipeRow.id,
        ingredient_id: ingredientId,
        amount: ing.amount || null,
        unit: ing.unit || null,
        notes: ing.notes || null,
        order_index: i,
      });

      if (linkError) throw linkError;
    }

    return NextResponse.json({ success: true, id: recipeRow.id });
  } catch (error: any) {
    console.error("Recipe creation error:", error);
    return NextResponse.json({ error: error.message || "Failed to create recipe" }, { status: 500 });
  }
}
