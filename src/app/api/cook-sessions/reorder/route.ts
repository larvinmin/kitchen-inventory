import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recalculateAfterReorder } from "@/lib/ranking";
import type { RatingCategory } from "@/lib/types";

/**
 * PATCH /api/cook-sessions/reorder — Reorder sessions after drag-and-drop
 *
 * Body: { orderedIds: string[] }
 * The array contains ALL session IDs in the new display order (best first).
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderedIds } = await request.json();

  if (!orderedIds || !Array.isArray(orderedIds)) {
    return NextResponse.json(
      { error: "orderedIds array is required" },
      { status: 400 }
    );
  }

  // Fetch current sessions
  const { data: sessions, error } = await supabase
    .from("cook_sessions")
    .select("id, rating_category, rating_rank")
    .eq("user_id", user.id)
    .in("id", orderedIds);

  if (error || !sessions) {
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }

  // Recalculate categories and scores based on new order
  const updated = recalculateAfterReorder(
    sessions as { id: string; rating_category: RatingCategory; rating_rank: number }[],
    orderedIds
  );

  // Batch update
  for (const item of updated) {
    await supabase
      .from("cook_sessions")
      .update({
        rating_category: item.rating_category,
        rating_rank: item.rating_rank,
        rating_score: item.rating_score,
      })
      .eq("id", item.id);
  }

  return NextResponse.json({ success: true, updated });
}
