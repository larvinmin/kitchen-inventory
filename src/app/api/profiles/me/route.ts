import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/**
 * GET /api/profiles/me — return the signed-in user's profile row.
 *
 * Lazily backfills a profile row if the auto-create trigger failed (e.g.
 * during the social-features rollout, or for accounts created before the
 * trigger existed). The row created here has `username_customized=false`
 * so middleware will route the user into onboarding.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  if (data) return NextResponse.json({ profile: data });

  // Backfill: try to derive a base from the email, retry a few times to
  // dodge collisions on the random suffix.
  const emailLocal =
    (user.email ?? "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    "user";
  const base = emailLocal.length >= 3 ? emailLocal.slice(0, 20) : "user";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}_${Math.random().toString(36).slice(2, 8)}`;
    const { data: created, error: insertErr } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        username: candidate,
        display_name: base,
      })
      .select()
      .single();
    if (!insertErr && created)
      return NextResponse.json({ profile: created });
    if (insertErr && insertErr.code !== "23505") {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { error: "Could not allocate a default username" },
    { status: 500 }
  );
}

/**
 * PATCH /api/profiles/me — update the signed-in user's profile.
 *
 * Setting `username` to anything else flips `username_customized` to true
 * (which clears the onboarding gate in middleware).
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body.username === "string") {
    const u = body.username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–30 characters and use only lowercase letters, numbers, or underscores",
        },
        { status: 400 }
      );
    }
    updates.username = u;
    updates.username_customized = true;
  }

  if (body.display_name !== undefined) {
    updates.display_name =
      typeof body.display_name === "string" && body.display_name.trim()
        ? body.display_name.trim()
        : null;
  }
  if (body.bio !== undefined) {
    updates.bio =
      typeof body.bio === "string" && body.bio.trim() ? body.bio.trim() : null;
  }
  if (body.avatar_url !== undefined) {
    updates.avatar_url =
      typeof body.avatar_url === "string" && body.avatar_url
        ? body.avatar_url
        : null;
  }
  if (typeof body.is_private === "boolean") {
    updates.is_private = body.is_private;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    // Surface a friendly message for the unique-violation case.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
