"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import fuzzysort from "fuzzysort";
import type { RecipeWithIngredients, InventoryItemWithIngredient } from "@/lib/types";

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [inventory, setInventory] = useState<InventoryItemWithIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [buildingList, setBuildingList] = useState(false);
  
  // To handle the custom tooltip/popup for matched items
  const [activeTooltipIdx, setActiveTooltipIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      // Fetch recipe
      const supabase = createClient();
      const recipePromise = supabase
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
        .eq("id", params.id as string)
        .single();
        
      // Fetch inventory for matching
      const invPromise = fetch("/api/inventory").then(res => res.json());

      const [recipeRes, invRes] = await Promise.all([recipePromise, invPromise]);
      
      if (cancelled) return;
      if (!recipeRes.error && recipeRes.data) {
        setRecipe(recipeRes.data as RecipeWithIngredients);
      }
      if (invRes.items) {
        setInventory(invRes.items);
      }
      setLoading(false);
    };
    
    fetchAll();
    return () => { cancelled = true; };
  }, [params.id]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    setDeleting(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("recipes")
      .delete()
      .eq("id", params.id as string);

    if (!error) {
      router.push("/recipes");
    } else {
      setDeleting(false);
    }
  };

  const toggleFavorite = async () => {
    if (!recipe) return;
    const supabase = createClient();
    const newValue = !recipe.is_favorite;

    const { error } = await supabase
      .from("recipes")
      .update({ is_favorite: newValue })
      .eq("id", recipe.id);

    if (!error) {
      setRecipe({ ...recipe, is_favorite: newValue });
    }
  };

  const toggleWantToMake = async () => {
    if (!recipe) return;
    const supabase = createClient();
    const newValue = !recipe.want_to_make;

    const { error } = await supabase
      .from("recipes")
      .update({ want_to_make: newValue })
      .eq("id", recipe.id);

    if (!error) {
      setRecipe({ ...recipe, want_to_make: newValue });
    }
  };

  // Helper to find inventory match
  const getMatch = (ingredientName: string | undefined) => {
    if (!ingredientName || ingredientName.trim() === "" || inventory.length === 0) return null;
    
    // First try a standard substring block as it's often more accurate for components like "Yellow Onion" -> "Onion"
    const substringMatch = inventory.find(i => {
      const invName = (i.ingredients?.name || "").trim().toLowerCase();
      if (!invName) return false;
      const targetName = ingredientName.trim().toLowerCase();
      return invName.includes(targetName) || targetName.includes(invName);
    });
    if (substringMatch) return substringMatch;

    // Fallback to fuzzy logic (allows for typos)
    const res = fuzzysort.go(ingredientName, inventory, { key: "ingredients.name", limit: 1, threshold: -500 });
    if (res && res.length > 0) return res[0].obj;
    
    return null;
  };

  const buildGroceryList = async () => {
    if (!recipe || !recipe.recipe_ingredients) return;
    setBuildingList(true);
    try {
      const missing = recipe.recipe_ingredients.filter(ri => !getMatch(ri.ingredients?.name));
      if (missing.length === 0) {
        alert("You already have all ingredients!");
        return;
      }
      const items = missing.map(ri => ({
        name: ri.ingredients?.name || "Unknown",
        amount: ri.amount,
        unit: ri.unit
      }));
      const res = await fetch("/api/grocery-list/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (res.ok) {
         alert(`Added missing ingredients to Grocery List!`);
      } else {
         const errorData = await res.json();
         alert(`Failed to build grocery list: ${errorData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to build grocery list. Check your network or API keys.");
    } finally {
      setBuildingList(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="h-6 w-32 bg-bg-tertiary rounded animate-pulse mb-6" />
        <div className="glass rounded-2xl p-8 space-y-6">
          <div className="h-8 w-2/3 bg-bg-tertiary rounded-lg animate-pulse" />
          <div className="h-4 w-1/2 bg-bg-tertiary rounded animate-pulse" />
          <div className="space-y-2">
            {[95, 80, 100, 70, 85].map((w, i) => (
              <div
                key={i}
                className="h-4 bg-bg-tertiary rounded animate-pulse"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <span className="text-5xl block mb-4">😕</span>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Recipe not found
        </h2>
        <Link
          href="/recipes"
          className="text-accent hover:text-accent-hover transition-colors text-sm"
        >
          ← Back to recipes
        </Link>
      </div>
    );
  }

  const instructions =
    typeof recipe.instructions === "string"
      ? JSON.parse(recipe.instructions)
      : recipe.instructions;

  const sortedIngredients = [...(recipe.recipe_ingredients || [])].sort(
    (a, b) => a.order_index - b.order_index
  );

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-24">
      {/* Back */}
      <Link
        href="/recipes"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to recipes
      </Link>

      {/* Hero thumbnail */}
      {recipe.source_thumbnail && (
        <div className="relative h-64 rounded-2xl overflow-hidden mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.source_thumbnail}
            alt={recipe.title}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 to-transparent" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="text-text-secondary mt-1">{recipe.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Favorite */}
          <button
            onClick={toggleFavorite}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              recipe.is_favorite
                ? "bg-red-500/10 border-red-500/20 text-red-500"
                : "bg-bg-tertiary border-border text-text-tertiary hover:text-text-secondary"
            }`}
            title={
              recipe.is_favorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
          >
            <svg
              className="w-5 h-5"
              fill={recipe.is_favorite ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </button>

          {/* Want to Make */}
          <button
            onClick={toggleWantToMake}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              recipe.want_to_make
                ? "bg-accent/10 border-accent/20 text-accent"
                : "bg-bg-tertiary border-border text-text-tertiary hover:text-text-secondary"
            }`}
            title={
              recipe.want_to_make
                ? "Remove from want to make"
                : "Add to want to make"
            }
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>

          {/* Build Grocery List */}
          <button
            onClick={buildGroceryList}
            disabled={buildingList}
            className="p-2.5 rounded-xl border border-border bg-bg-tertiary text-text-tertiary hover:text-green-500 hover:border-green-500/20 hover:bg-green-500/10 transition-all cursor-pointer disabled:opacity-50"
            title="Add missing items to Grocery List"
          >
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
             </svg>
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2.5 rounded-xl bg-bg-tertiary border border-border text-text-tertiary hover:text-error hover:border-error/20 hover:bg-error/10 transition-all cursor-pointer disabled:opacity-50"
            title="Delete recipe"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Cook This Button */}
      <Link
        href={`/recipes/${recipe.id}/cook`}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-accent text-text-inverse font-bold text-sm hover:bg-accent-hover transition-all active:scale-[0.98] mb-6"
      >
        <span className="text-lg">🍳</span>
        Cook This Recipe
      </Link>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 mb-8">
        {recipe.prep_time && (
          <div className="glass rounded-xl px-4 py-2.5">
            <span className="text-xs text-text-tertiary block">Prep</span>
            <span className="text-sm font-medium text-text-primary">
              {recipe.prep_time}
            </span>
          </div>
        )}
        {recipe.cook_time && (
          <div className="glass rounded-xl px-4 py-2.5">
            <span className="text-xs text-text-tertiary block">Cook</span>
            <span className="text-sm font-medium text-text-primary">
              {recipe.cook_time}
            </span>
          </div>
        )}
        {recipe.total_time && (
          <div className="glass rounded-xl px-4 py-2.5">
            <span className="text-xs text-text-tertiary block">Total</span>
            <span className="text-sm font-medium text-text-primary">
              {recipe.total_time}
            </span>
          </div>
        )}
        {recipe.servings && (
          <div className="glass rounded-xl px-4 py-2.5">
            <span className="text-xs text-text-tertiary block">Servings</span>
            <span className="text-sm font-medium text-text-primary">
              {recipe.servings}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {recipe.tags.map((tag, i) => (
            <span
              key={i}
              className="text-xs px-3 py-1 rounded-full bg-accent-muted text-accent border border-accent/10"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Ingredients */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
          Ingredients
        </h2>

        <ul className="space-y-2">
          {sortedIngredients.map((ri, i) => {
            const matchedInv = getMatch(ri.ingredients?.name);
            
            return (
              <li 
                key={i} 
                onClick={() => matchedInv ? setActiveTooltipIdx(activeTooltipIdx === i ? null : i) : null}
                className={`relative group flex items-baseline gap-2 text-sm p-3 border rounded-xl transition-colors ${matchedInv ? "bg-green-500/10 border-green-500/20 text-green-600 cursor-pointer hover:bg-green-500/20" : "bg-bg-primary border-border text-text-primary"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${matchedInv ? "bg-green-500" : "bg-accent"}`} />
                <span>
                  {ri.amount && (
                    <span className="font-medium mr-1">
                      {ri.amount}
                    </span>
                  )}
                  {ri.unit && (
                    <span className={matchedInv ? "opacity-80 mr-1" : "text-text-secondary mr-1"}>{ri.unit}</span>
                  )}
                  <span className={matchedInv ? "font-medium" : "text-text-primary"}>
                    {ri.ingredients?.name || "Unknown ingredient"}
                  </span>
                  {ri.notes && (
                    <span className={`italic ml-1 ${matchedInv ? "opacity-70" : "text-text-tertiary"}`}>
                      — {ri.notes}
                    </span>
                  )}
                </span>
                
                {/* Custom Tooltip */}
                {matchedInv && activeTooltipIdx === i && (
                  <div className="absolute top-full left-0 z-10 mt-1 bg-green-50 shadow-md border border-green-200/50 rounded-lg p-2.5 w-64 animate-fade-in text-green-900 pointer-events-none">
                     <p className="text-xs uppercase font-bold text-green-700/70 tracking-wider mb-0.5">In Inventory</p>
                     <p className="text-sm font-semibold">{matchedInv.amount || "1"} {matchedInv.unit || ""} {matchedInv.ingredients.name}</p>
                     {matchedInv.expires_at && (
                       <p className="text-xs text-green-700 mt-1 opacity-80">Exp: {matchedInv.expires_at.split("T")[0]}</p>
                     )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Instructions */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
            />
          </svg>
          Instructions
        </h2>

        <ol className="space-y-4">
          {(instructions as string[]).map((step: string, i: number) => (
            <li key={i} className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-text-secondary leading-relaxed pt-0.5">
                {step}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* Source */}
      {recipe.source_url && (
        <div className="glass rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </div>
            <div>
              <span className="text-xs text-text-tertiary">Source</span>
              <p className="text-sm text-text-secondary">Instagram Reel</p>
            </div>
          </div>
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            View original
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
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
