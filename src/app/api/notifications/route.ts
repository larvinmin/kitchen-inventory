import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 30;

/**
 * GET /api/notifications?cursor=<iso>
 *
 * Returns the most recent notifications for the signed-in user, plus an
 * unread count. Cursor pagination on `created_at` for stable ordering.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: count ?? 0,
    next_cursor:
      data && data.length === PAGE_SIZE
        ? data[data.length - 1].created_at
        : null,
  });
}

/**
 * PATCH /api/notifications
 *
 * Body: { ids?: string[], all?: boolean }
 * Marks the listed notifications (or all of mine) as read.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    q = q.in("id", body.ids);
  } else if (!body.all) {
    return NextResponse.json(
      { error: "Provide ids[] or all:true" },
      { status: 400 }
    );
  }

  const { error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
