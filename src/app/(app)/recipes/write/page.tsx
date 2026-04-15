"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RecipeForm from "@/components/RecipeForm";
import type { ParsedRecipe } from "@/lib/types";

export default function WriteRecipePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with blank state
  const initialRecipe: ParsedRecipe = {
    title: "",
    description: "",
    servings: "",
    prepTime: "",
    cookTime: "",
    totalTime: "",
    ingredients: [{ name: "", amount: "", unit: "", notes: "" }],
    instructions: [""],
    tags: [],
    sourceUrl: "",
    sourcePlatform: "manual",
    extractionMethod: "manual",
  };

  const handleSave = async (recipe: ParsedRecipe) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save recipe");
      }

      router.push(`/recipes/${data.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary">
          Write Recipe
        </h1>
        <p className="text-text-secondary mt-1">
          Create your own recipe from scratch. It will be saved to your library.
        </p>
      </div>

      <div className="glass rounded-2xl p-8 animate-scale-in">
        <RecipeForm 
          recipe={initialRecipe} 
          onSave={handleSave} 
          saving={saving} 
          autoGrow={true} 
        />

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-error/10 border border-error/20 text-sm text-error animate-slide-down">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
