import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RecipeIngredient } from "@/lib/types";
import { resolveIngredientRows } from "@/lib/recipes/ingredients";

type IterateBody = {
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
 * POST /api/recipes/[id]/iterate
 *
 * Creates a NEW recipe in the signed-in user's library based on an existing
 * owned recipe, with `parent_recipe_id` set to the original. Accepts an edited
 * payload so the caller (the recipe detail "Save as iteration" button) can
 * carry forward their in-progress changes instead of just cloning what's on
 * disk.
 *
 * Distinct from:
 *   • /api/recipes/[id]/fork  — same-mechanism clone when saving a *friend's*
 *     recipe to your own library.
 *   • /api/cook-sessions/save-iteration — driven by cook-session
 *     substitutions, not by manual editing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: source, error: sourceErr } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (sourceErr || !source) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  if (source.user_id !== user.id) {
    // Cross-user iteration is a separate flow (fork first, then edit).
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as IterateBody;

  // Pull edited fields from the caller, falling back to the source row so the
  // iteration is always a complete recipe.
  const title =
    (body.title ?? source.title ?? "Untitled").trim() || source.title || "Untitled";
  const description = "description" in body ? body.description : source.description;
  const servings = "servings" in body ? body.servings : source.servings;
  const prepTime = "prepTime" in body ? body.prepTime : source.prep_time;
  const cookTime = "cookTime" in body ? body.cookTime : source.cook_time;
  const totalTime = "totalTime" in body ? body.totalTime : source.total_time;
  const instructions = body.instructions
    ? body.instructions.filter((s) => s.trim())
    : source.instructions;
  const tags = body.tags
    ? body.tags.map((t) => t.trim()).filter(Boolean)
    : source.tags;

  // Default the iteration title to "(Iteration)" so it's easy to spot in the
  // library list. If the user already customized the title in edit mode we
  // leave it alone.
  const iterationTitle =
    title === source.title ? `${source.title} (Iteration)` : title;

  const { data: iteration, error: createErr } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: iterationTitle,
      description,
      servings,
      prep_time: prepTime,
      cook_time: cookTime,
      total_time: totalTime,
      instructions,
      tags,
      source_url: source.source_url,
      source_platform: source.source_platform,
      source_thumbnail: source.source_thumbnail,
      parent_recipe_id: source.id,
    })
    .select()
    .single();

  if (createErr || !iteration) {
    console.error("Iteration create failed:", createErr);
    return NextResponse.json(
      { error: createErr?.message || "Failed to create iteration" },
      { status: 500 }
    );
  }

  // Copy ingredients. If the caller provided edited ingredients we use those;
  // otherwise deep-copy from the source recipe's `recipe_ingredients`.
  try {
    if (body.ingredients) {
      const rows = await resolveIngredientRows(
        supabase,
        user.id,
        iteration.id,
        body.ingredients
      );
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("recipe_ingredients")
          .insert(rows);
        if (insErr) throw insErr;
      }
    } else {
      const { data: sourceIngs } = await supabase
        .from("recipe_ingredients")
        .select("ingredient_id, amount, unit, notes, order_index")
        .eq("recipe_id", source.id)
        .order("order_index");
      if (sourceIngs && sourceIngs.length > 0) {
        const rows = sourceIngs.map((ri) => ({
          recipe_id: iteration.id,
          ingredient_id: ri.ingredient_id,
          amount: ri.amount,
          unit: ri.unit,
          notes: ri.notes,
          order_index: ri.order_index,
        }));
        const { error: insErr } = await supabase
          .from("recipe_ingredients")
          .insert(rows);
        if (insErr) throw insErr;
      }
    }
  } catch (err) {
    // Best-effort cleanup so we don't leave a half-built iteration.
    await supabase.from("recipes").delete().eq("id", iteration.id);
    const message = err instanceof Error ? err.message : "Ingredient copy failed";
    console.error("Iteration ingredient copy failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ recipe: iteration }, { status: 201 });
}
