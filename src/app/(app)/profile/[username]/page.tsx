"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  CookSessionWithRecipe,
  DbProfile,
  RatingCategory,
} from "@/lib/types";
import FollowButton, { type FollowState } from "@/components/FollowButton";
import SaveToLibraryButton from "@/components/SaveToLibraryButton";

export default function PublicProfilePage() {
  const router = useRouter();
  const { username } = useParams<{ username: string }>();

  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [followState, setFollowState] = useState<FollowState>("none");
  const [counts, setCounts] = useState<{
    followers_count: number;
    following_count: number;
  }>({ followers_count: 0, following_count: 0 });
  const [sessions, setSessions] = useState<CookSessionWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.push("/login");
        return;
      }
      setMeId(user.id);

      // Self-redirect: viewing your own page just sends you to /profile
      const { data: target, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if (cancelled) return;
      if (profileErr || !target) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (target.id === user.id) {
        router.replace("/profile");
        return;
      }
      setProfile(target);

      // Existing follow row (RLS lets me see follow rows I'm part of)
      const { data: existing } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", user.id)
        .eq("followee_id", target.id)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        setFollowState(
          existing.status === "accepted" ? "accepted" : "pending"
        );
      }

      // Public counts via SECURITY DEFINER RPC
      const { data: countsData } = await supabase.rpc("public_follow_counts", {
        target_id: target.id,
      });
      if (cancelled) return;
      if (countsData && countsData[0]) {
        setCounts({
          followers_count: Number(countsData[0].followers_count) || 0,
          following_count: Number(countsData[0].following_count) || 0,
        });
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [username, router]);

  // Load their cook log when we have access (i.e. follow accepted).
  // RLS will return empty for everyone else, but we don't even ask in that case
  // to avoid confusing UI.
  useEffect(() => {
    if (!profile || followState !== "accepted") {
      setSessions([]);
      return;
    }
    const supabase = createClient();
    supabase
      .from("cook_sessions")
      .select("*, recipes!cook_sessions_recipe_id_fkey(id, title, source_thumbnail, tags)")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        const CATEGORY_ORDER: Record<string, number> = { good: 0, ok: 1, bad: 2 };
        const sorted = (data ?? []).slice().sort((a, b) => {
          const catA = CATEGORY_ORDER[a.rating_category ?? ""] ?? 3;
          const catB = CATEGORY_ORDER[b.rating_category ?? ""] ?? 3;
          if (catA !== catB) return catA - catB;
          return (a.rating_rank ?? 0) - (b.rating_rank ?? 0);
        });
        setSessions(sorted as CookSessionWithRecipe[]);
      });
  }, [profile, followState]);

  if (loading) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="h-20 w-20 rounded-full bg-bg-tertiary animate-pulse" />
        <div className="h-6 w-1/2 bg-bg-tertiary rounded mt-4 animate-pulse" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <h1 className="text-2xl font-bold text-text-primary">User not found</h1>
        <Link
          href="/profile"
          className="text-accent text-sm mt-3 inline-block hover:underline"
        >
          Back to my profile
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl">👤</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-text-primary truncate">
              {profile.display_name || profile.username}
            </h1>
            <p className="text-text-tertiary text-sm">@{profile.username}</p>
            <div className="flex gap-4 mt-2 text-sm text-text-secondary">
              <span>
                <strong className="text-text-primary">
                  {counts.followers_count}
                </strong>{" "}
                followers
              </span>
              <span>
                <strong className="text-text-primary">
                  {counts.following_count}
                </strong>{" "}
                following
              </span>
            </div>
          </div>
          {meId && (
            <FollowButton
              followeeId={profile.id}
              initialState={followState}
              onChange={setFollowState}
            />
          )}
        </div>
        {profile.bio && (
          <p className="mt-4 text-sm text-text-secondary whitespace-pre-line">
            {profile.bio}
          </p>
        )}
      </div>

      {/* Cook log */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Cook log
        </h2>

        {followState !== "accepted" ? (
          <div className="glass rounded-2xl p-8 text-center">
            <span className="text-3xl block mb-3">
              {profile.is_private ? "🔒" : "👥"}
            </span>
            <p className="text-sm text-text-secondary">
              {followState === "pending"
                ? "Your follow request is pending."
                : profile.is_private
                  ? "This profile is private. Send a follow request to see their cook log."
                  : "Follow to see their cook log and ranked recipes."}
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
            They haven&apos;t cooked anything yet.
          </div>
        ) : (
          <PublicCookLog sessions={sessions} viewerUsername={username} />
        )}
      </div>
    </div>
  );
}

function PublicCookLog({
  sessions,
}: {
  sessions: CookSessionWithRecipe[];
  viewerUsername: string;
}) {
  const badge = (cat: RatingCategory | null) => {
    switch (cat) {
      case "good":
        return {
          emoji: "🤩",
          label: "Good",
          color:
            "bg-green-500/10 text-green-400 border-green-500/20",
        };
      case "ok":
        return {
          emoji: "😐",
          label: "Ok",
          color:
            "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
        };
      case "bad":
        return {
          emoji: "🤢",
          label: "Bad",
          color: "bg-red-500/10 text-red-400 border-red-500/20",
        };
      default:
        return {
          emoji: "❓",
          label: "Unrated",
          color: "bg-bg-tertiary text-text-tertiary border-border",
        };
    }
  };

  const breaks = new Set<number>();
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].rating_category !== sessions[i - 1].rating_category) {
      breaks.add(i);
    }
  }

  return (
    <div className="space-y-1">
      {sessions.map((s, idx) => {
        const b = badge(s.rating_category);
        const recipeTitle = s.recipes?.title ?? s.recipe_title ?? "Removed recipe";
        const recipeThumb =
          s.recipes?.source_thumbnail ?? s.recipe_thumbnail ?? null;
        const recipeRemoved = !s.recipes;
        return (
          <div key={s.id}>
            {(idx === 0 || breaks.has(idx)) && (
              <div className="flex items-center gap-3 py-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${b.color}`}
                >
                  {b.emoji} {b.label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <div className="glass rounded-xl p-3 flex items-center gap-3">
              <span className="text-xs font-bold text-text-tertiary w-5 text-center">
                {idx + 1}
              </span>

              {s.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.photo_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : recipeThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recipeThumb}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                  <span className="text-lg">🍽️</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-text-primary truncate">
                  {recipeTitle}
                </h3>
                <p className="text-xs text-text-tertiary flex items-center gap-1.5">
                  <span>
                    {new Date(
                      s.completed_at || s.created_at
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {recipeRemoved && (
                    <span className="px-1.5 py-0.5 rounded-md bg-bg-tertiary border border-border text-[10px] text-text-tertiary">
                      Removed
                    </span>
                  )}
                </p>
              </div>

              <span
                className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${b.color}`}
              >
                {s.rating_score?.toFixed(1) ?? "—"}
              </span>

              {s.recipes?.id && (
                <SaveToLibraryButton
                  recipeId={s.recipes.id}
                  variant="compact"
                  redirectAfter={false}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
