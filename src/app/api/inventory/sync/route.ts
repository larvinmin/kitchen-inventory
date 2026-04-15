import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items } = await request.json();

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Invalid items format" }, { status: 400 });
  }

  try {
    for (const item of items) {
      if (!item.name || !item.name.trim()) continue;

      const ingredientName = item.name.trim().toLowerCase();

      // 1. Find or create ingredient across the global dictionary
      let ingredientId: string;
      const { data: existingIng } = await supabase
        .from("ingredients")
        .select("id, category")
        .eq("name", ingredientName)
        .maybeSingle();

      if (existingIng) {
        ingredientId = existingIng.id;
        if (item.category && item.category !== "Other") {
          // If the user specified a real category, upgrade the ingredient's category globally
          await supabase
            .from("ingredients")
            .update({ category: item.category })
            .eq("id", ingredientId);
        }
      } else {
        const { data: newIng, error: ingError } = await supabase
          .from("ingredients")
          .insert({
            name: ingredientName,
            category: item.category || "Other",
            created_by: user.id,
          })
          .select("id")
          .single();
          
        if (ingError) throw ingError;
        ingredientId = newIng.id;
      }

      // 2. Insert into inventory_items
      const { error: invError } = await supabase
        .from("inventory_items")
        .insert({
          user_id: user.id,
          ingredient_id: ingredientId,
          amount: item.amount || null,
          unit: item.unit || null,
          expires_at: item.expires_at || null,
        });

      if (invError) throw invError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Inventory sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
