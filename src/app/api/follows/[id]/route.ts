import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/follows/:id  Body: { action: "accept" | "decline" }
 *
 * Used by the followee to resolve a pending request. Decline is implemented as
 * a DELETE so we don't carry around 'declined' rows that would block re-requests.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "accept") {
    const { data, error } = await supabase
      .from("follows")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("followee_id", user.id) // RLS already enforces, but be explicit
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ follow: data });
  }

  if (action === "decline") {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("id", id)
      .eq("followee_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "action must be 'accept' or 'decline'" },
    { status: 400 }
  );
}
