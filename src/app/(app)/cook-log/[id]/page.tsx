"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CookSessionDetail, RatingCategory } from "@/lib/types";

export default function CookSessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<CookSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [savingIteration, setSavingIteration] = useState(false);
  const [iterationSaved, setIterationSaved] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    fetch(`/api/cook-sessions/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session || null);
        setNotesValue(data.session?.notes || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/cook-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue || null }),
      });
      if (res.ok) {
        setSession((prev) => prev ? { ...prev, notes: notesValue || null } : prev);
        setEditingNotes(false);
      }
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this cook log entry?")) return;
    setDeleting(true);
    const res = await fetch(`/api/cook-sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/cook-log");
    }
    setDeleting(false);
  };

  const handleSaveAsIteration = async () => {
    if (!session || session.cook_substitutions.length === 0) return;
    setSavingIteration(true);

    try {
      const res = await fetch("/api/cook-sessions/save-iteration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (res.ok) {
        setIterationSaved(true);
      }
    } catch (err) {
      console.error("Failed to save iteration:", err);
    } finally {
      setSavingIteration(false);
    }
  };

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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="h-64 bg-bg-tertiary rounded-2xl animate-pulse mb-6" />
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="h-6 w-2/3 bg-bg-tertiary rounded-lg animate-pulse" />
          <div className="h-4 w-1/3 bg-bg-tertiary rounded animate-pulse" />
          <div className="h-20 bg-bg-tertiary rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="text-5xl block mb-4">😕</span>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Session not found
        </h2>
        <Link
          href="/cook-log"
          className="text-accent hover:text-accent-hover transition-colors text-sm"
        >
          ← Back to Cook Log
        </Link>
      </div>
    );
  }

  const badge = getCategoryBadge(session.rating_category);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Back */}
      <Link
        href="/cook-log"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Cook Log
      </Link>

      {/* Meal Photo */}
      {session.photo_url && (
        <div className="relative h-72 rounded-2xl overflow-hidden mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={session.photo_url}
            alt="Meal photo"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 to-transparent" />

          {/* Score overlay */}
          <div className="absolute bottom-4 left-4 flex items-center gap-3">
            <span className="text-3xl font-black text-white tabular-nums">
              {session.rating_score?.toFixed(1)}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full border ${badge.color}`}>
              {badge.emoji} {badge.label}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {session.recipes?.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Cooked on{" "}
            {new Date(
              session.completed_at || session.created_at
            ).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Score (if no photo) */}
        {!session.photo_url && session.rating_score !== null && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-lg font-bold px-3 py-1.5 rounded-xl border ${badge.color}`}>
              {session.rating_score.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Link to Original Recipe */}
      <Link
        href={`/recipes/${session.recipe_id}`}
        className="glass rounded-xl p-3 flex items-center gap-3 mb-6 hover:border-border-hover transition-all"
      >
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
        <div className="flex-1 min-w-0">
          <span className="text-xs text-text-tertiary">Original Recipe</span>
          <h3 className="text-sm font-medium text-text-primary truncate">
            {session.recipes?.title}
          </h3>
        </div>
        <svg className="w-4 h-4 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      {/* Notes — always shown, editable */}
      <div className="glass rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Notes
          </h2>
          {!editingNotes ? (
            <button
              onClick={() => { setNotesValue(session.notes || ""); setEditingNotes(true); }}
              className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-accent/10"
            >
              {session.notes ? "Edit" : "+ Add Notes"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingNotes(false); setNotesValue(session.notes || ""); }}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="text-xs text-accent font-semibold hover:text-accent-hover transition-colors cursor-pointer px-2 py-1 rounded-lg bg-accent/10 disabled:opacity-60"
              >
                {savingNotes ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
        {editingNotes ? (
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Add notes about this meal..."
            className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none resize-none h-28"
            autoFocus
          />
        ) : session.notes ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {session.notes}
          </p>
        ) : (
          <p className="text-sm text-text-tertiary italic">No notes yet</p>
        )}
      </div>

      {/* Modifications (Substitutions) */}
      {(session.cook_substitutions && session.cook_substitutions.length > 0 || (session.modified_instructions && session.modified_instructions.length > 0)) && (
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider flex items-center gap-2">
            🛠 Modifications
          </h2>
          
          <div className="space-y-6">
            {/* Swaps */}
            {session.cook_substitutions.filter(s => s.sub_type === "swap").length > 0 && (
              <div>
                <h3 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-2 px-1">Swaps</h3>
                <div className="space-y-2">
                  {session.cook_substitutions.filter(s => s.sub_type === "swap").map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary/50 border border-border">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-text-tertiary line-through truncate block">
                          {sub.original_amount} {sub.original_unit} {sub.original_ingredient_name}
                        </span>
                      </div>
                      <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      <div className="flex-1 min-w-0 text-right">
                        <span className="text-sm font-bold text-text-primary">
                          {sub.substitute_amount} {sub.substitute_unit} {sub.substitute_ingredient_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additions */}
            {session.cook_substitutions.filter(s => s.sub_type === "addition").length > 0 && (
              <div>
                <h3 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-2 px-1">Additions</h3>
                <div className="space-y-2">
                  {session.cook_substitutions.filter(s => s.sub_type === "addition").map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary/50 border border-border">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 text-xs font-bold">+</div>
                      <div className="flex-1">
                        <span className="text-sm font-bold text-text-primary">
                          {sub.substitute_amount} {sub.substitute_unit} {sub.substitute_ingredient_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deletions */}
            {session.cook_substitutions.filter(s => s.sub_type === "deletion").length > 0 && (
              <div>
                <h3 className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-2 px-1">Deletions</h3>
                <div className="space-y-2">
                  {session.cook_substitutions.filter(s => s.sub_type === "deletion").map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary/50 border border-border opacity-60">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 text-xs font-bold">−</div>
                      <div className="flex-1">
                        <span className="text-sm text-text-tertiary line-through">
                          {sub.original_amount} {sub.original_unit} {sub.original_ingredient_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Instruction Changes */}
            {session.modified_instructions && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <span className="text-lg">📝</span>
                      <span className="text-sm font-semibold text-text-primary">
                         You changed {Math.abs((session.modified_instructions?.length || 0) - (typeof session.recipes?.instructions === 'string' ? JSON.parse(session.recipes.instructions).length : (session.recipes?.instructions?.length || 0)))} steps
                      </span>
                   </div>
                   <button 
                     onClick={() => {
                        const original = typeof session.recipes?.instructions === 'string' 
                           ? JSON.parse(session.recipes.instructions) 
                           : session.recipes?.instructions || [];
                        console.log("Original vs Modified:", original, session.modified_instructions);
                        alert("Modified steps saved! Click 'Save as Recipe Iteration' to create a new version with these steps.");
                     }}
                     className="text-[10px] font-bold text-accent uppercase tracking-tight"
                   >
                     Modified
                   </button>
                </div>
              </div>
            )}
          </div>

          {/* Save as Iteration */}
          {!session.variant_recipe_id && !iterationSaved && (
            <button
              onClick={handleSaveAsIteration}
              disabled={savingIteration}
              className="mt-6 w-full py-3.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all cursor-pointer shadow-lg shadow-accent/20 active:scale-[0.98] disabled:opacity-60"
            >
              {savingIteration ? "Saving..." : "💾 Save as Recipe Iteration"}
            </button>
          )}
          {iterationSaved && (
            <div className="mt-6 py-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center font-bold">
              ✅ Saved as a recipe Iteration!
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-8">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 py-3 rounded-xl bg-bg-tertiary border border-border text-text-secondary text-sm font-medium hover:text-error hover:border-error/20 hover:bg-error/10 transition-all cursor-pointer disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "🗑 Delete Entry"}
        </button>
      </div>
    </div>
  );
}
