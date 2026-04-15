import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeCategoryScores } from "@/lib/ranking";
import type { RatingCategory } from "@/lib/types";

/**
 * GET /api/cook-sessions — List all cooking sessions for the current user
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cook_sessions")
    .select(
      `
      *,
      recipes!cook_sessions_recipe_id_fkey (id, title, source_thumbnail, tags)
    `
    )
    .eq("user_id", user.id)
    .order("rating_score", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Failed to fetch cook sessions:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data || [] });
}

/**
 * POST /api/cook-sessions — Create a new cooking session with rating
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    recipe_id,
    notes,
    photo_url,
    rating_category,
    rating_rank, // insertion rank from pairwise comparison
    substitutions, // array of substitution objects
  } = body;

  if (!recipe_id || !rating_category) {
    return NextResponse.json(
      { error: "recipe_id and rating_category are required" },
      { status: 400 }
    );
  }

  // Step 1: Shift existing ranks to make room for the new item
  // All items at or after the insertion rank get bumped up by 1
  const { error: shiftError } = await supabase.rpc("increment_ranks_after", {
    p_user_id: user.id,
    p_category: rating_category,
    p_rank: rating_rank ?? 0,
  });

  // If the RPC doesn't exist yet, do it manually
  if (shiftError) {
    // Fallback: fetch all sessions in this category and shift manually
    const { data: existing } = await supabase
      .from("cook_sessions")
      .select("id, rating_rank")
      .eq("user_id", user.id)
      .eq("rating_category", rating_category)
      .gte("rating_rank", rating_rank ?? 0)
      .order("rating_rank", { ascending: false });

    if (existing) {
      for (const session of existing) {
        await supabase
          .from("cook_sessions")
          .update({ rating_rank: (session.rating_rank ?? 0) + 1 })
          .eq("id", session.id);
      }
    }
  }

  // Step 2: Insert the new cook session
  const { data: session, error: insertError } = await supabase
    .from("cook_sessions")
    .insert({
      user_id: user.id,
      recipe_id,
      notes: notes || null,
      photo_url: photo_url || null,
      rating_category,
      rating_rank: rating_rank ?? 0,
      rating_score: 0, // will be recomputed below
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError || !session) {
    console.error("Failed to create cook session:", insertError);
    return NextResponse.json(
      { error: insertError?.message || "Failed to create session" },
      { status: 500 }
    );
  }

  // Step 3: Insert substitutions if any
  if (substitutions && substitutions.length > 0) {
    const subsToInsert = substitutions.map(
      (sub: {
        original_recipe_ingredient_id?: string;
        original_ingredient_name: string;
        original_amount?: string;
        original_unit?: string;
        substitute_ingredient_name: string;
        substitute_amount?: string;
        substitute_unit?: string;
        substitute_notes?: string;
      }) => ({
        cook_session_id: session.id,
        original_recipe_ingredient_id:
          sub.original_recipe_ingredient_id || null,
        original_ingredient_name: sub.original_ingredient_name,
        original_amount: sub.original_amount || null,
        original_unit: sub.original_unit || null,
        substitute_ingredient_name: sub.substitute_ingredient_name,
        substitute_amount: sub.substitute_amount || null,
        substitute_unit: sub.substitute_unit || null,
        substitute_notes: sub.substitute_notes || null,
      })
    );

    const { error: subError } = await supabase
      .from("cook_substitutions")
      .insert(subsToInsert);

    if (subError) {
      console.error("Failed to insert substitutions:", subError);
    }
  }

  // Step 4: Recompute scores for all items in this category
  await recomputeCategoryScores(
    supabase,
    user.id,
    rating_category as RatingCategory
  );

  // Fetch the final session with updated score
  const { data: finalSession } = await supabase
    .from("cook_sessions")
    .select(
      `*, recipes!cook_sessions_recipe_id_fkey (id, title, source_thumbnail, tags)`
    )
    .eq("id", session.id)
    .single();

  return NextResponse.json({ session: finalSession }, { status: 201 });
}

/**
 * Recompute all scores in a category after a rank change.
 */
async function recomputeCategoryScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  category: RatingCategory
) {
  const { data: sessions } = await supabase
    .from("cook_sessions")
    .select("id, rating_rank")
    .eq("user_id", userId)
    .eq("rating_category", category)
    .order("rating_rank", { ascending: true });

  if (!sessions || sessions.length === 0) return;

  const scores = computeCategoryScores(sessions.length, category);

  // Batch update each session with its new score
  for (let i = 0; i < sessions.length; i++) {
    await supabase
      .from("cook_sessions")
      .update({ rating_score: scores[i], rating_rank: i })
      .eq("id", sessions[i].id);
  }
}
