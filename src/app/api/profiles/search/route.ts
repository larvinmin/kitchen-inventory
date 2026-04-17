import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/profiles/search?q=term
 *
 * Prefix-matches against username and substring-matches against display_name.
 * Caps results at 10. The signed-in user is filtered out client-side from
 * the dropdown (we still return them so they can find their own page).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ profiles: [] });

  const escaped = q.replace(/[%_\\]/g, "\\$&");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_private")
    .or(`username.ilike.${escaped}%,display_name.ilike.%${escaped}%`)
    .neq("id", user.id)
    .limit(10);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}
