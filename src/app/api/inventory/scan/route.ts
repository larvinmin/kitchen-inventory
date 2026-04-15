import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanInventory } from "@/lib/gemini";

/**
 * POST /api/inventory/scan
 * Takes an uploaded image (multipart/form-data with "image" field),
 * passes it to Gemini to get bounding boxes and ingredient list,
 * and returns the structured data to the frontend for verification.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!validTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Accepted: JPEG, PNG, WebP, HEIC" },
      { status: 400 }
    );
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const items = await scanInventory(base64, file.type);
    
    // Add unique IDs to the items so the frontend can easily track edits
    const itemsWithIds = (items || []).map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
    }));

    return NextResponse.json({ items: itemsWithIds });
  } catch (error: any) {
    console.error("Inventory scan API error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to scan inventory" },
      { status: 500 }
    );
  }
}
