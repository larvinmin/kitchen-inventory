import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { items } = json as { items: { name: string; amount?: string; unit?: string }[] };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid items schema" }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // AI Check
    const { data: existingData, error: viewError } = await supabase
      .from("grocery_list_items")
      .select("*")
      .eq("user_id", user.id);
      
    if (viewError) throw viewError;

    const validExistingItems = (existingData || []).filter(i => (i.name || "").trim().length > 0);

    let processedData = [];
    
    if (validExistingItems.length === 0) {
      // Just standard insertion
      const payload = items.map((itm) => ({
        user_id: user.id,
        name: itm.name,
        amount: itm.amount || null,
        unit: itm.unit || null
      }));
      const { data, error } = await supabase.from("grocery_list_items").insert(payload).select();
      if (error) throw error;
      processedData = data;
    } else {
      // Send to LLM
      const { mergeGroceryList } = await import("@/lib/gemini");
      
      const castExisting = validExistingItems.map(i => ({
        id: i.id, name: i.name, amount: i.amount || "", unit: i.unit || ""
      }));
      const castNew = items.map(i => ({
        name: i.name, amount: i.amount || "", unit: i.unit || ""
      }));

      const instructions = await mergeGroceryList(castExisting, castNew);
      if (!instructions) {
        throw new Error("AI failed to return instructions");
      }

      const inserts = instructions.filter(ins => ins.action === "INSERT").map(ins => ({
        user_id: user.id,
        name: ins.name || "Unknown",
        amount: ins.new_amount || null,
        unit: ins.new_unit || null
      }));

      const updates = instructions.filter(ins => ins.action === "UPDATE");

      // Execute updates
      for (const upd of updates) {
        if (!upd.target_id) continue;
        await supabase
          .from("grocery_list_items")
          .update({ amount: upd.new_amount, unit: upd.new_unit })
          .eq("id", upd.target_id)
          .eq("user_id", user.id);
      }

      // Execute inserts
      if (inserts.length > 0) {
        const { data, error } = await supabase.from("grocery_list_items").insert(inserts).select();
        if (error) throw error;
        processedData = data;
      }
    }

    return NextResponse.json({ success: true, count: processedData.length, items: processedData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
