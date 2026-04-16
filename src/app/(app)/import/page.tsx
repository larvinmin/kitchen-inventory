"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ImportUrlInput from "@/components/ImportUrlInput";
import RecipeForm from "@/components/RecipeForm";
import type { ParsedRecipe } from "@/lib/types";

type ImportState = "input" | "processing" | "review";

export default function ImportPage() {
  const [state, setState] = useState<ImportState>("input");
  const [recipe, setRecipe] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleImport = async (url: string) => {
    setState("processing");
    setError(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to import recipe");
        setState("input");
        return;
      }

      setRecipe(data.recipe);
      setState("review");
    } catch {
      setError("Network error. Please try again.");
      setState("input");
    }
  };

  const handleSave = async (editedRecipe: ParsedRecipe) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be logged in to save recipes");
        setSaving(false);
        return;
      }

      // Proxy-download the Instagram CDN thumbnail through our server so we
      // store a permanent Supabase Storage URL instead of an ephemeral CDN URL
      // that expires and is blocked by browser hotlink protection.
      let thumbnailUrl: string | null = editedRecipe.sourceThumbnail || null;
      if (thumbnailUrl) {
        try {
          const proxyRes = await fetch("/api/proxy-thumbnail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: thumbnailUrl }),
          });
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            thumbnailUrl = proxyData.url ?? thumbnailUrl;
          }
        } catch {
          // Non-fatal — fall back to the original URL if proxying fails
        }
      }

      // 1. Insert the recipe
      const { data: recipeRow, error: recipeError } = await supabase
        .from("recipes")
        .insert({
          user_id: user.id,
          title: editedRecipe.title,
          description: editedRecipe.description || null,
          servings: editedRecipe.servings || null,
          prep_time: editedRecipe.prepTime || null,
          cook_time: editedRecipe.cookTime || null,
          total_time: editedRecipe.totalTime || null,
          instructions: editedRecipe.instructions,
          tags: editedRecipe.tags,
          source_url: editedRecipe.sourceUrl || null,
          source_platform: editedRecipe.sourcePlatform || null,
          source_thumbnail: thumbnailUrl,
        })
        .select("id")
        .single();

      if (recipeError) throw recipeError;

      // 2. Upsert ingredients and link them
      for (let i = 0; i < editedRecipe.ingredients.length; i++) {
        const ing = editedRecipe.ingredients[i];
        if (!ing.name.trim()) continue;

        // Try to find or create the ingredient
        let ingredientId: string;
        const { data: existing } = await supabase
          .from("ingredients")
          .select("id")
          .eq("name", ing.name.toLowerCase().trim())
          .is("created_by", null)
          .maybeSingle();

        if (existing) {
          ingredientId = existing.id;
        } else {
          // Check user-created ingredients
          const { data: userExisting } = await supabase
            .from("ingredients")
            .select("id")
            .eq("name", ing.name.toLowerCase().trim())
            .eq("created_by", user.id)
            .maybeSingle();

          if (userExisting) {
            ingredientId = userExisting.id;
          } else {
            // Create new ingredient
            const { data: newIng, error: ingError } = await supabase
              .from("ingredients")
              .insert({
                name: ing.name.toLowerCase().trim(),
                created_by: user.id,
              })
              .select("id")
              .single();

            if (ingError) throw ingError;
            ingredientId = newIng.id;
          }
        }

        // Link to recipe
        await supabase.from("recipe_ingredients").insert({
          recipe_id: recipeRow.id,
          ingredient_id: ingredientId,
          amount: ing.amount || null,
          unit: ing.unit || null,
          notes: ing.notes || null,
          order_index: i,
        });
      }

      // Navigate to the saved recipe
      router.push(`/recipes/${recipeRow.id}`);
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save recipe. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary">
          Import Recipe
        </h1>
        <p className="text-text-secondary mt-1">
          Paste a link from Instagram Reels to automatically extract the recipe
        </p>
      </div>

      {/* Input State */}
      {state === "input" && (
        <div className="animate-fade-in">
          <div className="glass rounded-2xl p-8">
            <ImportUrlInput onImport={handleImport} loading={false} />
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-error/10 border border-error/20 text-sm text-error animate-slide-down">
              {error}
            </div>
          )}

          {/* How it works */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: "🔗",
                title: "Paste URL",
                desc: "Drop an Instagram Reel link",
              },
              {
                icon: "🤖",
                title: "AI Extracts",
                desc: "We parse the recipe using AI",
              },
              {
                icon: "📚",
                title: "Save & Cook",
                desc: "Review, edit, and save to your library",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="glass rounded-xl p-5 text-center"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className="text-2xl block mb-2">{step.icon}</span>
                <h3 className="text-sm font-semibold text-text-primary">
                  {step.title}
                </h3>
                <p className="text-xs text-text-tertiary mt-1">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing State */}
      {state === "processing" && (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 border border-accent/20 mb-6 animate-pulse-glow">
            <svg
              className="w-8 h-8 text-accent animate-spin-slow"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Importing your recipe...
          </h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Scraping the Reel and extracting ingredients and instructions with
            AI. This may take 15-30 seconds.
          </p>

          {/* Progress indicators */}
          <div className="mt-8 space-y-3 max-w-xs mx-auto text-left">
            {[
              "Fetching Instagram Reel...",
              "Analyzing content...",
              "Extracting recipe...",
            ].map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-sm"
                style={{ animationDelay: `${i * 3}s` }}
              >
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-text-secondary">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review State */}
      {state === "review" && recipe && (
        <div className="glass rounded-2xl p-8 animate-scale-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Review Recipe
              </h2>
              <p className="text-sm text-text-secondary">
                Edit any details before saving to your library
              </p>
            </div>
            <button
              onClick={() => {
                setState("input");
                setRecipe(null);
                setError(null);
              }}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              ← Import another
            </button>
          </div>

          <RecipeForm recipe={recipe} onSave={handleSave} saving={saving} />

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-error/10 border border-error/20 text-sm text-error animate-slide-down">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
