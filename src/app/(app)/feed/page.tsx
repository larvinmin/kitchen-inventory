"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { FeedItem, RatingCategory } from "@/lib/types";
import SaveToLibraryButton from "@/components/SaveToLibraryButton";

const PAGE_SIZE = 30;

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (offset: number) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Get the IDs I follow (accepted only).
    const { data: followRows } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("status", "accepted");

    const followeeIds = (followRows ?? []).map((r) => r.followee_id);
    if (followeeIds.length === 0) return [];

    // Pull their cook sessions. RLS already permits this for accepted follows,
    // but the explicit `.in()` lets PostgREST use the user_id index efficiently.
    // We can't auto-join `profiles` because cook_sessions.user_id FKs auth.users
    // (not profiles), so we fetch profile rows in a second query and stitch.
    const { data: rawSessions, error } = await supabase
      .from("cook_sessions")
      .select(
        `
        *,
        recipes!cook_sessions_recipe_id_fkey(id, title, source_thumbnail, tags)
      `
      )
      .in("user_id", followeeIds)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Feed load failed:", error);
      return [];
    }
    if (!rawSessions || rawSessions.length === 0) return [];

    const userIds = Array.from(new Set(rawSessions.map((s) => s.user_id)));
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);

    const profileById = new Map(
      (profileRows ?? []).map((p) => [p.id, p])
    );

    return rawSessions.map((s) => ({
      ...s,
      profiles: profileById.get(s.user_id) ?? {
        id: s.user_id,
        username: "unknown",
        display_name: null,
        avatar_url: null,
      },
    })) as unknown as FeedItem[];
  };

  useEffect(() => {
    let cancelled = false;
    load(0).then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = await load(items.length);
    setItems((prev) => [...prev, ...next]);
    setHasMore(next.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="h-7 w-32 bg-bg-tertiary rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-bg-tertiary animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 bg-bg-tertiary rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-bg-tertiary rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Feed</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Recent cooks from people you follow
        </p>
      </div>

      {items.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <span className="text-4xl block mb-3">🍽️</span>
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            Your feed is empty
          </h2>
          <p className="text-sm text-text-secondary mb-5 max-w-sm mx-auto">
            Follow other cooks to see what they&apos;re making.
          </p>
          <Link
            href="/profile?onboarding=0"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90"
          >
            Find friends
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 rounded-xl bg-bg-tertiary border border-border text-sm text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const cook = item.profiles;
  // The recipe may have been deleted from the cook's library after the
  // session was posted. The session itself stays in the feed; we fall
  // back to the snapshot fields the DB captured at cook time.
  const recipe = item.recipes;
  const recipeTitle = recipe?.title ?? item.recipe_title ?? "Removed recipe";
  const recipeThumb = recipe?.source_thumbnail ?? item.recipe_thumbnail ?? null;
  const cat = item.rating_category as RatingCategory | null;
  const badge =
    cat === "good"
      ? { emoji: "🤩", label: "Good", color: "text-green-400" }
      : cat === "ok"
        ? { emoji: "😐", label: "Ok", color: "text-yellow-400" }
        : cat === "bad"
          ? { emoji: "🤢", label: "Bad", color: "text-red-400" }
          : { emoji: "❓", label: "Unrated", color: "text-text-tertiary" };

  const when = new Date(item.completed_at || item.created_at);
  const ago = relativeTime(when);

  return (
    <div className="glass rounded-2xl p-4">
      {/* Actor row */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href={`/profile/${cook.username}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center shrink-0">
            {cook.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cook.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-base">👤</span>
            )}
          </div>
          <div className="text-sm">
            <span className="font-medium text-text-primary group-hover:underline">
              {cook.display_name || cook.username}
            </span>
            <span className="text-text-tertiary"> cooked</span>
          </div>
        </Link>
        <span className="ml-auto text-xs text-text-tertiary">{ago}</span>
      </div>

      {/* Body — links to the cook session detail (RLS gates it) */}
      <Link href={`/cook-log/${item.id}`} className="block group">
        <div className="flex gap-3">
          {item.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photo_url}
              alt=""
              className="w-20 h-20 rounded-xl object-cover shrink-0"
            />
          ) : recipeThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipeThumb}
              alt=""
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-bg-tertiary flex items-center justify-center shrink-0">
              <span className="text-2xl">🍽️</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent line-clamp-2">
              {recipeTitle}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className={`font-medium ${badge.color}`}>
                {badge.emoji} {badge.label}
              </span>
              {item.rating_score != null && (
                <span className="text-text-tertiary">
                  · {item.rating_score.toFixed(1)}
                </span>
              )}
            </div>
            {item.notes && (
              <p className="text-xs text-text-secondary mt-2 line-clamp-2">
                {item.notes}
              </p>
            )}
          </div>
        </div>
      </Link>

      {recipe?.id && (
        <div className="mt-3 flex justify-end">
          <SaveToLibraryButton recipeId={recipe.id} variant="compact" />
        </div>
      )}
    </div>
  );
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
