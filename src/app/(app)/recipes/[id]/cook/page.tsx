"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  RecipeWithIngredients,
  CookingIngredient,
  CookSessionWithRecipe,
  RatingCategory,
} from "@/lib/types";
import { createBinarySearch } from "@/lib/ranking";

type Phase = "cooking" | "photo" | "rating";
type RatingStep = "category" | "compare" | "done";

export default function CookPage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = params.id as string;

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("cooking");

  // Cooking phase state
  const [ingredients, setIngredients] = useState<CookingIngredient[]>([]);
  const [notes, setNotes] = useState("");
  const [substituteModalIdx, setSubstituteModalIdx] = useState<number | null>(null);
  const [subForm, setSubForm] = useState({ name: "", amount: "", unit: "" });

  // Photo phase state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [postCookNotes, setPostCookNotes] = useState("");

  // Rating phase state
  const [ratingStep, setRatingStep] = useState<RatingStep>("category");
  const [selectedCategory, setSelectedCategory] = useState<RatingCategory | null>(null);
  const [categoryItems, setCategoryItems] = useState<CookSessionWithRecipe[]>([]);
  const [binarySearch, setBinarySearch] = useState<ReturnType<typeof createBinarySearch> | null>(null);
  const [currentCompareIdx, setCurrentCompareIdx] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Swipe state for substituted ingredients
  const [swipedIdx, setSwipedIdx] = useState<number | null>(null);

  // Load recipe
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("recipes")
      .select(
        `
        *,
        recipe_ingredients (
          *,
          ingredients (*)
        )
      `
      )
      .eq("id", recipeId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setRecipe(data as RecipeWithIngredients);
          const sorted = [...(data.recipe_ingredients || [])].sort(
            (a, b) => a.order_index - b.order_index
          );
          setIngredients(
            sorted.map((ri) => ({
              recipeIngredientId: ri.id,
              originalName: ri.ingredients?.name || "Unknown",
              originalAmount: ri.amount || "",
              originalUnit: ri.unit || "",
              originalNotes: ri.notes || "",
              isSubstituted: false,
            }))
          );
        }
        setLoading(false);
      });
  }, [recipeId]);

  // Handle photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Upload photo
  const uploadPhoto = async () => {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      const res = await fetch("/api/upload-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setPhotoUrl(data.url);
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Proceed to photo phase
  const finishCooking = () => {
    setPhase("photo");
  };

  // Proceed to rating phase
  const finishPhoto = async () => {
    if (photoFile) {
      await uploadPhoto();
    }
    setPhase("rating");
  };

  // Category selection - load existing items for comparison
  const selectCategory = useCallback(
    async (category: RatingCategory) => {
      setSelectedCategory(category);

      // Fetch existing sessions in this category
      const res = await fetch("/api/cook-sessions");
      const data = await res.json();
      const sessionsInCategory = (data.sessions || []).filter(
        (s: CookSessionWithRecipe) => s.rating_category === category
      );

      // Sort by rank (best first)
      sessionsInCategory.sort(
        (a: CookSessionWithRecipe, b: CookSessionWithRecipe) =>
          (a.rating_rank ?? 0) - (b.rating_rank ?? 0)
      );

      setCategoryItems(sessionsInCategory);

      if (sessionsInCategory.length === 0) {
        // First item in category — no comparison needed
        setRatingStep("done");
        setFinalScore(
          category === "good" ? 8.4 : category === "ok" ? 5.0 : 1.7
        );
      } else {
        // Start binary search
        const bs = createBinarySearch(sessionsInCategory.length);
        setBinarySearch(bs);
        setCurrentCompareIdx(bs.getMidpoint());
        setRatingStep("compare");
      }
    },
    []
  );

  // Pairwise comparison handlers
  const handleBetter = () => {
    if (!binarySearch) return;
    binarySearch.better();
    if (binarySearch.isComplete()) {
      finishComparison();
    } else {
      setCurrentCompareIdx(binarySearch.getMidpoint());
    }
  };

  const handleWorse = () => {
    if (!binarySearch) return;
    binarySearch.worse();
    if (binarySearch.isComplete()) {
      finishComparison();
    } else {
      setCurrentCompareIdx(binarySearch.getMidpoint());
    }
  };

  const finishComparison = () => {
    if (!binarySearch || !selectedCategory) return;
    const insertionRank = binarySearch.getInsertionRank();
    const totalAfterInsert = categoryItems.length + 1;

    // Estimate score from position
    const ranges = { bad: [0, 3.3], ok: [3.3, 6.7], good: [6.7, 10] };
    const [min, max] = ranges[selectedCategory];
    const fraction =
      totalAfterInsert === 1 ? 0.5 : insertionRank / (totalAfterInsert - 1);
    const score = Number((max - fraction * (max - min)).toFixed(1));

    setFinalScore(score);
    setRatingStep("done");
  };

  // Save the session
  const saveSession = async () => {
    if (!recipe || !selectedCategory || !binarySearch) {
      // Handle first-in-category case
      if (!recipe || !selectedCategory) return;
    }

    setSaving(true);

    const substitutions = ingredients
      .filter((ing) => ing.isSubstituted)
      .map((ing) => ({
        original_recipe_ingredient_id: ing.recipeIngredientId,
        original_ingredient_name: ing.originalName,
        original_amount: ing.originalAmount,
        original_unit: ing.originalUnit,
        substitute_ingredient_name: ing.substituteName!,
        substitute_amount: ing.substituteAmount || "",
        substitute_unit: ing.substituteUnit || "",
        substitute_notes: ing.substituteNotes || "",
      }));

    const combinedNotes = [notes, postCookNotes].filter(Boolean).join("\n\n---\n\n");

    try {
      const res = await fetch("/api/cook-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          notes: combinedNotes || null,
          photo_url: photoUrl,
          rating_category: selectedCategory,
          rating_rank: binarySearch?.getInsertionRank() ?? 0,
          substitutions,
        }),
      });

      if (res.ok) {
        router.push("/cook-log");
      }
    } catch (err) {
      console.error("Failed to save session:", err);
    } finally {
      setSaving(false);
    }
  };

  // Substitute an ingredient
  const applySubstitute = () => {
    if (substituteModalIdx === null || !subForm.name.trim()) return;

    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === substituteModalIdx
          ? {
              ...ing,
              substituteName: subForm.name,
              substituteAmount: subForm.amount,
              substituteUnit: subForm.unit,
              isSubstituted: true,
            }
          : ing
      )
    );
    setSubstituteModalIdx(null);
    setSubForm({ name: "", amount: "", unit: "" });
  };

  // Undo substitution
  const undoSubstitute = (idx: number) => {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === idx
          ? {
              ...ing,
              substituteName: undefined,
              substituteAmount: undefined,
              substituteUnit: undefined,
              isSubstituted: false,
            }
          : ing
      )
    );
    setSwipedIdx(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Loading recipe...</p>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-20">
        <span className="text-5xl block mb-4">😕</span>
        <h2 className="text-lg font-semibold text-text-primary">
          Recipe not found
        </h2>
      </div>
    );
  }

  const instructions =
    typeof recipe.instructions === "string"
      ? JSON.parse(recipe.instructions)
      : recipe.instructions;

  // ───────────────── PHASE: COOKING ─────────────────
  if (phase === "cooking") {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.back()}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors mb-1 cursor-pointer"
            >
              ← Cancel
            </button>
            <h1 className="text-xl font-bold text-text-primary">
              🍳 Cooking: {recipe.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent">
              Step 1 of 3
            </span>
          </div>
        </div>

        {/* Ingredients */}
        <div className="glass rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">
            Ingredients
          </h2>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-xl"
              >
                {/* Swipeable container */}
                <div
                  className={`relative transition-transform duration-200 ${
                    swipedIdx === idx ? "-translate-x-24" : ""
                  }`}
                  onClick={() => {
                    if (ing.isSubstituted) {
                      setSwipedIdx(swipedIdx === idx ? null : idx);
                    }
                  }}
                >
                  <div
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      ing.isSubstituted
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-bg-secondary/50 border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          ing.isSubstituted ? "bg-amber-500" : "bg-accent"
                        }`}
                      />
                      <div className="min-w-0">
                        {ing.isSubstituted ? (
                          <div>
                            <span className="text-sm font-medium text-text-primary">
                              {ing.substituteAmount} {ing.substituteUnit}{" "}
                              {ing.substituteName}
                            </span>
                            <span className="text-xs text-text-tertiary ml-2">
                              (swapped)
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-text-primary">
                            {ing.originalAmount && (
                              <span className="font-medium">
                                {ing.originalAmount}{" "}
                              </span>
                            )}
                            {ing.originalUnit && (
                              <span className="text-text-secondary">
                                {ing.originalUnit}{" "}
                              </span>
                            )}
                            {ing.originalName}
                            {ing.originalNotes && (
                              <span className="text-text-tertiary italic">
                                {" "}
                                — {ing.originalNotes}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {!ing.isSubstituted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubstituteModalIdx(idx);
                          setSubForm({ name: "", amount: "", unit: "" });
                        }}
                        className="shrink-0 text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-accent/10"
                      >
                        Swap
                      </button>
                    )}
                  </div>
                </div>

                {/* Reveal: original ingredient + undo button (shown on swipe) */}
                {ing.isSubstituted && swipedIdx === idx && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-2">
                    <div className="text-xs text-text-tertiary px-2">
                      was: {ing.originalName}
                    </div>
                    <button
                      onClick={() => undoSubstitute(idx)}
                      className="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="glass rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">
            Instructions
          </h2>
          <ol className="space-y-3">
            {(instructions as string[]).map((step: string, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-text-secondary leading-relaxed pt-0.5">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* Cooking Notes */}
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3 uppercase tracking-wider">
            Cooking Notes
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note any modifications, timing adjustments, etc..."
            className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none resize-none h-24"
          />
        </div>

        {/* Finish Button */}
        <button
          onClick={finishCooking}
          className="w-full py-4 rounded-2xl bg-accent text-text-inverse font-bold text-base hover:bg-accent-hover transition-all cursor-pointer active:scale-[0.98]"
        >
          ✅ Finish Cooking
        </button>

        {/* Substitute Modal */}
        {substituteModalIdx !== null && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-text-primary mb-1">
                Substitute Ingredient
              </h3>
              <p className="text-xs text-text-tertiary mb-4">
                Replacing:{" "}
                <span className="text-text-secondary">
                  {ingredients[substituteModalIdx].originalAmount}{" "}
                  {ingredients[substituteModalIdx].originalUnit}{" "}
                  {ingredients[substituteModalIdx].originalName}
                </span>
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={subForm.name}
                  onChange={(e) =>
                    setSubForm({ ...subForm, name: e.target.value })
                  }
                  placeholder="Substitute name (e.g. almond milk)"
                  className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subForm.amount}
                    onChange={(e) =>
                      setSubForm({ ...subForm, amount: e.target.value })
                    }
                    placeholder="Amount"
                    className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                  <input
                    type="text"
                    value={subForm.unit}
                    onChange={(e) =>
                      setSubForm({ ...subForm, unit: e.target.value })
                    }
                    placeholder="Unit"
                    className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setSubstituteModalIdx(null)}
                  className="flex-1 py-2.5 rounded-xl bg-bg-tertiary text-text-secondary text-sm font-medium hover:bg-bg-secondary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={applySubstitute}
                  disabled={!subForm.name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-text-inverse text-sm font-bold hover:bg-accent-hover transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Swap
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ───────────────── PHASE: PHOTO + NOTES ─────────────────
  if (phase === "photo") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent inline-block mb-3">
            Step 2 of 3
          </span>
          <h1 className="text-xl font-bold text-text-primary">
            📸 How did it turn out?
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Upload a photo and add any notes about the result
          </p>
        </div>

        {/* Photo Upload */}
        <div className="glass rounded-2xl p-5 mb-5">
          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Meal preview"
                className="w-full h-64 object-cover rounded-xl"
              />
              <button
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border hover:border-accent/40 transition-colors cursor-pointer">
              <svg className="w-10 h-10 text-text-tertiary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              <span className="text-sm text-text-tertiary">Tap to upload a photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Post-cook Notes */}
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3 uppercase tracking-wider">
            How was it?
          </h2>
          <textarea
            value={postCookNotes}
            onChange={(e) => setPostCookNotes(e.target.value)}
            placeholder="Was too salty, tasted great, need less garlic next time..."
            className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none resize-none h-24"
          />
        </div>

        {/* Continue */}
        <button
          onClick={finishPhoto}
          disabled={uploading}
          className="w-full py-4 rounded-2xl bg-accent text-text-inverse font-bold text-base hover:bg-accent-hover transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Continue to Rating →"}
        </button>

        <button
          onClick={() => {
            setPhotoFile(null);
            setPhotoPreview(null);
            setPhase("rating");
          }}
          className="w-full py-3 text-text-tertiary text-sm mt-2 hover:text-text-secondary transition-colors cursor-pointer"
        >
          Skip photo
        </button>
      </div>
    );
  }

  // ───────────────── PHASE: RATING ─────────────────
  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <div className="text-center mb-6">
        <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent inline-block mb-3">
          Step 3 of 3
        </span>
        <h1 className="text-xl font-bold text-text-primary">
          ⭐ Rate this meal
        </h1>
      </div>

      {/* Step 1: Category Selection */}
      {ratingStep === "category" && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary text-center mb-6">
            How would you categorize this meal overall?
          </p>
          {(
            [
              {
                key: "bad" as const,
                emoji: "🤢",
                label: "Bad",
                desc: "Wouldn't make again",
                color: "from-red-500/10 to-red-600/5 border-red-500/20 hover:border-red-500/40",
              },
              {
                key: "ok" as const,
                emoji: "😐",
                label: "Ok",
                desc: "It was fine",
                color: "from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 hover:border-yellow-500/40",
              },
              {
                key: "good" as const,
                emoji: "🤩",
                label: "Good",
                desc: "Would definitely make again",
                color: "from-green-500/10 to-green-600/5 border-green-500/20 hover:border-green-500/40",
              },
            ] as const
          ).map(({ key, emoji, label, desc, color }) => (
            <button
              key={key}
              onClick={() => selectCategory(key)}
              className={`w-full p-5 rounded-2xl border bg-gradient-to-r ${color} transition-all cursor-pointer active:scale-[0.98] text-left`}
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">{emoji}</span>
                <div>
                  <h3 className="font-semibold text-text-primary">{label}</h3>
                  <p className="text-xs text-text-secondary">{desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Pairwise Comparison */}
      {ratingStep === "compare" && currentCompareIdx !== null && categoryItems[currentCompareIdx] && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-text-secondary text-center mb-5">
            Was your meal <span className="text-text-primary font-medium">better</span> or{" "}
            <span className="text-text-primary font-medium">worse</span> than...
          </p>

          {/* Comparison meal card */}
          <div className="glass rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              {categoryItems[currentCompareIdx].recipes?.source_thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={categoryItems[currentCompareIdx].recipes.source_thumbnail!}
                  alt={categoryItems[currentCompareIdx].recipes.title}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-bg-tertiary flex items-center justify-center">
                  <span className="text-xl">🍽️</span>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-text-primary text-sm">
                  {categoryItems[currentCompareIdx].recipes.title}
                </h3>
                {categoryItems[currentCompareIdx].rating_score !== null && (
                  <span className="text-xs text-text-tertiary">
                    Score: {categoryItems[currentCompareIdx].rating_score}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Better / Worse buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleBetter}
              className="flex-1 py-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold hover:bg-green-500/20 transition-all cursor-pointer active:scale-[0.97]"
            >
              👆 Better
            </button>
            <button
              onClick={handleWorse}
              className="flex-1 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold hover:bg-red-500/20 transition-all cursor-pointer active:scale-[0.97]"
            >
              👇 Worse
            </button>
          </div>

          <p className="text-xs text-text-tertiary text-center mt-3">
            {Math.ceil(
              Math.log2(categoryItems.length + 1) -
                (binarySearch
                  ? Math.log2(categoryItems.length + 1) -
                    Math.log2(
                      Math.max(1, categoryItems.length - (currentCompareIdx ?? 0))
                    )
                  : 0)
            )}{" "}
            comparison{categoryItems.length > 1 ? "s" : ""} remaining
          </p>
        </div>
      )}

      {/* Step 3: Score Reveal */}
      {ratingStep === "done" && finalScore !== null && (
        <div className="text-center">
          <div className="glass rounded-2xl p-8 mb-6">
            <div className="text-6xl font-black text-accent mb-2 tabular-nums">
              {finalScore.toFixed(1)}
            </div>
            <div className="text-sm text-text-secondary">
              out of 10
            </div>
            <div className="mt-4">
              <span
                className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${
                  selectedCategory === "good"
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : selectedCategory === "ok"
                    ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}
              >
                {selectedCategory === "good"
                  ? "🤩 Good"
                  : selectedCategory === "ok"
                  ? "😐 Ok"
                  : "🤢 Bad"}
              </span>
            </div>
          </div>

          <button
            onClick={saveSession}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-accent text-text-inverse font-bold text-base hover:bg-accent-hover transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "Saving..." : "🎉 Save to Cook Log"}
          </button>
        </div>
      )}
    </div>
  );
}
