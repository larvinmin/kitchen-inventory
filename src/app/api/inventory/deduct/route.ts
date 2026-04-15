import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductInventory } from "@/lib/gemini";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items } = await request.json();
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ success: true, message: "No deductions to process" });
  }

  try {
    const results = await deductInventory(items);

    if (results && results.length > 0) {
      for (const res of results) {
        // Enforce boundary that user can only edit their own inventory strings
        const { data: ownershipCheck } = await supabase
          .from("inventory_items")
          .select("id")
          .eq("id", res.inventory_item_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (ownershipCheck) {
          if (res.action === "DELETE") {
            await supabase
              .from("inventory_items")
              .delete()
              .eq("id", res.inventory_item_id);
          } else if (res.action === "UPDATE") {
            await supabase
              .from("inventory_items")
              .update({ amount: res.new_amount || null, unit: res.new_unit || null })
              .eq("id", res.inventory_item_id);
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Deduct integration failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
