"use client";

import { useState, useEffect } from "react";
import type { ParsedRecipe, RecipeIngredient } from "@/lib/types";

interface RecipeFormProps {
  recipe: ParsedRecipe;
  onSave: (recipe: ParsedRecipe) => void;
  saving: boolean;
  autoGrow?: boolean;
}

export default function RecipeForm({ recipe, onSave, saving, autoGrow = false }: RecipeFormProps) {
  const [form, setForm] = useState<ParsedRecipe>(recipe);

  // Auto-grow logic
  useEffect(() => {
    if (!autoGrow) return;

    // Ingredients
    const activeIngs = form.ingredients.filter(i => i.name.trim() !== "").length;
    const targetIngCount = Math.max(5, activeIngs + 1);
    if (form.ingredients.length < targetIngCount) {
      setForm(prev => {
        const nextIngs = [...prev.ingredients];
        while (nextIngs.length < targetIngCount) {
          nextIngs.push({ name: "", amount: "", unit: "", notes: "" });
        }
        return { ...prev, ingredients: nextIngs };
      });
    }

    // Instructions
    const activeSteps = form.instructions.filter(s => s.trim() !== "").length;
    const targetStepCount = Math.max(5, activeSteps + 1);
    if (form.instructions.length < targetStepCount) {
      setForm(prev => {
        const nextSteps = [...prev.instructions];
        while (nextSteps.length < targetStepCount) {
          nextSteps.push("");
        }
        return { ...prev, instructions: nextSteps };
      });
    }
  }, [form.ingredients, form.instructions, autoGrow]);

  const updateField = (field: keyof ParsedRecipe, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateIngredient = (
    index: number,
    field: keyof RecipeIngredient,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      ),
    }));
  };

  const addIngredient = () => {
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { name: "", amount: "", unit: "", notes: "" },
      ],
    }));
  };

  const removeIngredient = (index: number) => {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      instructions: prev.instructions.map((step, i) =>
        i === index ? value : step
      ),
    }));
  };

  const addInstruction = () => {
    setForm((prev) => ({
      ...prev,
      instructions: [...prev.instructions, ""],
    }));
  };

  const removeInstruction = (index: number) => {
    setForm((prev) => ({
      ...prev,
      instructions: prev.instructions.filter((_, i) => i !== index),
    }));
  };

  const updateTag = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.map((tag, i) => (i === index ? value : tag)),
    }));
  };

  const addTag = () => {
    setForm((prev) => ({ ...prev, tags: [...prev.tags, ""] }));
  };

  const removeTag = (index: number) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty ingredients and instructions
    const cleaned: ParsedRecipe = {
      ...form,
      ingredients: form.ingredients.filter((ing) => ing.name.trim()),
      instructions: form.instructions.filter((step) => step.trim()),
      tags: form.tags.filter((tag) => tag.trim()),
    };
    onSave(cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
      {/* Extraction badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${
            recipe.extractionMethod === "video"
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
              : recipe.extractionMethod === "manual"
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "bg-accent-muted text-accent border border-accent/20"
          }`}
        >
          {recipe.extractionMethod === "video" ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Extracted from video
            </>
          ) : recipe.extractionMethod === "manual" ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Manual Entry
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              Extracted from caption
            </>
          )}
        </span>
      </div>

      {/* Title + Description */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Recipe Title
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-bg-tertiary border border-border text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none text-lg font-semibold"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            value={form.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            rows={2}
            placeholder="Brief description of the dish..."
            className="w-full px-4 py-3 rounded-xl bg-bg-tertiary border border-border text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none resize-none"
          />
        </div>
      </div>

      {/* Time & Servings */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Servings", field: "servings" as const, placeholder: "4" },
          {
            label: "Prep Time",
            field: "prepTime" as const,
            placeholder: "15 min",
          },
          {
            label: "Cook Time",
            field: "cookTime" as const,
            placeholder: "30 min",
          },
          {
            label: "Total Time",
            field: "totalTime" as const,
            placeholder: "45 min",
          },
        ].map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className="block text-xs font-medium text-text-tertiary mb-1">
              {label}
            </label>
            <input
              type="text"
              value={(form[field] as string) || ""}
              onChange={(e) => updateField(field, e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
            />
          </div>
        ))}
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Ingredients
          </h3>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add
          </button>
        </div>

        <div className="space-y-2">
          {form.ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <input
                type="text"
                value={ing.amount}
                onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                placeholder="Amt"
                className="w-16 px-2 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none text-center"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                placeholder="Unit"
                className="w-20 px-2 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
              />
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(i, "name", e.target.value)}
                placeholder="Ingredient name"
                className="flex-1 px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
              />
              <input
                type="text"
                value={ing.notes || ""}
                onChange={(e) => updateIngredient(i, "notes", e.target.value)}
                placeholder="Notes"
                className="w-28 px-2 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none hidden sm:block"
              />
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Instructions
          </h3>
          <button
            type="button"
            onClick={addInstruction}
            className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Step
          </button>
        </div>

        <div className="space-y-2">
          {form.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-2 group">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-bold mt-1.5 shrink-0">
                {i + 1}
              </span>
              <textarea
                value={step}
                onChange={(e) => updateInstruction(i, e.target.value)}
                rows={2}
                placeholder={`Step ${i + 1}...`}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none resize-none"
              />
              <button
                type="button"
                onClick={() => removeInstruction(i)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100 mt-1.5 cursor-pointer"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Tags</h3>
          <button
            type="button"
            onClick={addTag}
            className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Tag
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {form.tags.map((tag, i) => (
            <div key={i} className="flex items-center gap-1 group">
              <input
                type="text"
                value={tag}
                onChange={(e) => updateTag(i, e.target.value)}
                placeholder="tag"
                className="w-24 px-3 py-1.5 rounded-full bg-bg-tertiary border border-border text-text-primary text-xs placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none text-center"
              />
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="p-0.5 rounded-full text-text-tertiary hover:text-error transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4 pt-4 border-t border-border">
        <button
          type="submit"
          disabled={saving}
          className="px-8 py-3 rounded-xl bg-accent text-text-inverse font-semibold hover:bg-accent-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </span>
          ) : (
            "Save to Library"
          )}
        </button>
        <span className="text-xs text-text-tertiary">
          You can always edit this later
        </span>
      </div>
    </form>
  );
}
