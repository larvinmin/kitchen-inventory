"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { CookSessionWithRecipe, RatingCategory } from "@/lib/types";

export default function CookLogPage() {
  const [sessions, setSessions] = useState<CookSessionWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/cook-sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Drag and drop handlers
  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };

  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;

    const newSessions = [...sessions];
    const draggedItem = newSessions.splice(dragItem.current, 1)[0];
    newSessions.splice(dragOverItem.current, 0, draggedItem);

    setSessions(newSessions);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // Save reorder
  const saveReorder = useCallback(async () => {
    setSaving(true);
    try {
      const orderedIds = sessions.map((s) => s.id);
      const res = await fetch("/api/cook-sessions/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state with new scores/categories
        const updateMap = new Map(
          data.updated.map((u: { id: string; rating_category: string; rating_score: number; rating_rank: number }) => [u.id, u])
        );
        setSessions((prev) =>
          prev.map((s) => {
            const update = updateMap.get(s.id);
            if (update) {
              return {
                ...s,
                rating_category: (update as { rating_category: RatingCategory }).rating_category,
                rating_rank: (update as { rating_rank: number }).rating_rank,
                rating_score: (update as { rating_score: number }).rating_score,
              };
            }
            return s;
          })
        );
        setEditMode(false);
      }
    } catch (err) {
      console.error("Failed to save reorder:", err);
    } finally {
      setSaving(false);
    }
  }, [sessions]);

  // Group sessions by category for visual separators
  const getCategoryBadge = (category: RatingCategory | null) => {
    switch (category) {
      case "good":
        return { emoji: "🤩", label: "Good", color: "bg-green-500/10 text-green-400 border-green-500/20" };
      case "ok":
        return { emoji: "😐", label: "Ok", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" };
      case "bad":
        return { emoji: "🤢", label: "Bad", color: "bg-red-500/10 text-red-400 border-red-500/20" };
      default:
        return { emoji: "❓", label: "Unrated", color: "bg-bg-tertiary text-text-tertiary border-border" };
    }
  };

  // Find category boundaries for visual separators
  const categoryBreaks = new Set<number>();
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].rating_category !== sessions[i - 1].rating_category) {
      categoryBreaks.add(i);
    }
  }

  // Stats
  const totalCooks = sessions.length;
  const avgScore =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.rating_score ?? 0), 0) / sessions.length
      : 0;
  const bestMeal = sessions.length > 0 ? sessions[0] : null;

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <div className="h-8 w-48 bg-bg-tertiary rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-bg-tertiary rounded-lg animate-pulse mt-2" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 flex gap-3">
              <div className="w-12 h-12 bg-bg-tertiary rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-bg-tertiary rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-bg-tertiary rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cook Log</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {totalCooks} meal{totalCooks !== 1 ? "s" : ""} ranked
          </p>
        </div>
        {sessions.length > 1 && (
          <div>
            {editMode ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 rounded-xl text-sm text-text-secondary bg-bg-secondary border border-border hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveReorder}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-text-inverse hover:bg-accent-hover transition-all cursor-pointer disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 rounded-xl text-sm text-text-secondary bg-bg-secondary border border-border hover:border-accent/30 hover:text-accent transition-colors cursor-pointer"
              >
                ✏️ Edit Ranking
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-accent">{totalCooks}</div>
            <div className="text-xs text-text-tertiary">Total Cooks</div>
          </div>
          <div className="glass rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-accent">
              {avgScore.toFixed(1)}
            </div>
            <div className="text-xs text-text-tertiary">Avg Score</div>
          </div>
          <div className="glass rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-accent truncate px-1">
              {bestMeal?.recipes?.title?.split(" ").slice(0, 2).join(" ") || "—"}
            </div>
            <div className="text-xs text-text-tertiary">Best Meal</div>
          </div>
        </div>
      )}

      {/* Ranked List */}
      {sessions.length > 0 ? (
        <div className="space-y-1">
          {sessions.map((session, idx) => {
            const badge = getCategoryBadge(session.rating_category);
            const isBreak = categoryBreaks.has(idx);

            return (
              <div key={session.id}>
                {/* Category separator */}
                {isBreak && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getCategoryBadge(session.rating_category).color}`}>
                      {getCategoryBadge(session.rating_category).emoji}{" "}
                      {getCategoryBadge(session.rating_category).label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* First category label */}
                {idx === 0 && (
                  <div className="flex items-center gap-3 pb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>
                      {badge.emoji} {badge.label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                <div
                  draggable={editMode}
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  {editMode ? (
                    <div className="glass rounded-xl p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:border-accent/30 transition-all">
                      {/* Drag handle */}
                      <div className="text-text-tertiary shrink-0">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </div>

                      {/* Rank number */}
                      <span className="text-xs font-bold text-text-tertiary w-5 text-center">
                        {idx + 1}
                      </span>

                      {/* Thumbnail */}
                      {session.recipes?.source_thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={session.recipes.source_thumbnail}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                          <span className="text-sm">🍽️</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-text-primary truncate">
                          {session.recipes?.title}
                        </h3>
                        <p className="text-xs text-text-tertiary">
                          {new Date(session.completed_at || session.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Score */}
                      <span className={`text-sm font-bold px-2 py-1 rounded-lg ${badge.color}`}>
                        {session.rating_score?.toFixed(1)}
                      </span>
                    </div>
                  ) : (
                    <Link href={`/cook-log/${session.id}`}>
                      <div className="glass rounded-xl p-3 flex items-center gap-3 hover:border-border-hover hover:scale-[1.01] transition-all cursor-pointer">
                        {/* Rank */}
                        <span className="text-xs font-bold text-text-tertiary w-5 text-center">
                          {idx + 1}
                        </span>

                        {/* Photo or thumbnail */}
                        {session.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={session.photo_url}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                          />
                        ) : session.recipes?.source_thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={session.recipes.source_thumbnail}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                            <span className="text-lg">🍽️</span>
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-text-primary truncate">
                            {session.recipes?.title}
                          </h3>
                          <p className="text-xs text-text-tertiary">
                            {new Date(
                              session.completed_at || session.created_at
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>

                        {/* Score badge */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${badge.color}`}
                          >
                            {session.rating_score?.toFixed(1) ?? "—"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🍳</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No meals cooked yet
          </h2>
          <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto">
            Cook a recipe to start building your ranking.
          </p>
          <Link
            href="/recipes"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-text-inverse font-semibold text-sm hover:bg-accent-hover transition-all"
          >
            Browse Recipes
          </Link>
        </div>
      )}
    </div>
  );
}
