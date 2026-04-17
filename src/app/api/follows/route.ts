import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/follows — request or instantly follow another user.
 *
 * Body: { followee_id: string } OR { username: string }
 *
 * The DB trigger `auto_accept_follow` decides whether the resulting row is
 * 'pending' (private followee) or 'accepted' (public followee), so the API
 * stays one-shot.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let followeeId: string | null = body.followee_id ?? null;

  if (!followeeId && typeof body.username === "string") {
    const { data: target } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", body.username.toLowerCase())
      .maybeSingle();
    followeeId = target?.id ?? null;
  }

  if (!followeeId)
    return NextResponse.json({ error: "followee not found" }, { status: 404 });
  if (followeeId === user.id)
    return NextResponse.json(
      { error: "Cannot follow yourself" },
      { status: 400 }
    );

  const { data, error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, followee_id: followeeId })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already following or requested" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ follow: data });
}

/**
 * DELETE /api/follows?followee_id=...
 *
 * Removes my follow row toward the given user (covers both "unfollow" and
 * "cancel pending request"). Idempotent.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const followeeId = searchParams.get("followee_id");
  if (!followeeId)
    return NextResponse.json(
      { error: "followee_id is required" },
      { status: 400 }
    );

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
