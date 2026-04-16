import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/proxy-thumbnail
 *
 * Fetches an external image URL server-side (bypassing browser hotlink
 * protection like Instagram CDN's Sec-Fetch-Site checks) and re-uploads
 * it to Supabase Storage so we own a permanent, publicly-servable copy.
 *
 * Body: { url: string }
 * Returns: { url: string } — the Supabase Storage public URL
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    // Fetch the image server-side — Node.js doesn't send Sec-Fetch-Site,
    // so CDN hotlink protection that blocks browser <img> loads is bypassed.
    const imageRes = await fetch(url, {
      headers: {
        // Mimic a plain browser GET so CDN edge caches serve the full image
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Remote image returned ${imageRes.status}` },
        { status: 502 }
      );
    }

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
      ? "webp"
      : "jpg";

    const buffer = await imageRes.arrayBuffer();

    // Store under the user's folder — satisfies the meal-photos RLS upload policy
    const filename = `${user.id}/thumbnails/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("meal-photos")
      .upload(filename, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error("Thumbnail upload failed:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("meal-photos").getPublicUrl(filename);

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    console.error("proxy-thumbnail error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to proxy thumbnail" },
      { status: 500 }
    );
  }
}
