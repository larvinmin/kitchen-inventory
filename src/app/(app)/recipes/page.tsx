"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DbRecipe } from "@/lib/types";
import RecipeCard from "@/components/RecipeCard";
import Link from "next/link";

type Filter = "all" | "favorites" | "want_to_make";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<DbRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setRecipes(data);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredRecipes = recipes.filter((recipe) => {
    // Filter
    if (filter === "favorites" && !recipe.is_favorite) return false;
    if (filter === "want_to_make" && !recipe.want_to_make) return false;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesTitle = recipe.title.toLowerCase().includes(q);
      const matchesTags = recipe.tags?.some((tag) =>
        tag.toLowerCase().includes(q)
      );
      return matchesTitle || matchesTags;
    }

    return true;
  });

  const handleFavoriteToggle = (id: string, isFavorite: boolean) => {
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_favorite: isFavorite } : r))
    );
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <div className="h-8 w-48 bg-bg-tertiary rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-bg-tertiary rounded-lg animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="glass rounded-2xl overflow-hidden"
            >
              <div className="h-44 bg-bg-tertiary animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-bg-tertiary rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-bg-tertiary rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            My Recipes
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} in your
            library
          </p>
        </div>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-text-inverse font-semibold text-sm hover:bg-accent-hover transition-all duration-200"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Import Recipe
        </Link>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes or tags..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2">
          {(
            [
              { key: "all" as const, label: "All" },
              { key: "favorites" as const, label: "♥ Favorites" },
              { key: "want_to_make" as const, label: "🍴 Want to Make" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                filter === key
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "bg-bg-secondary text-text-secondary border border-border hover:border-border-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe Grid */}
      {filteredRecipes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        /* Empty state - no recipes at all */
        <div className="glass rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">📚</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Your recipe library is empty
          </h2>
          <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto">
            Import your first recipe from an Instagram Reel or create one
            manually.
          </p>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-text-inverse font-semibold text-sm hover:bg-accent-hover transition-all duration-200"
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
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Import Your First Recipe
          </Link>
        </div>
      ) : (
        /* Empty state - no matches for filter/search */
        <div className="glass rounded-2xl p-12 text-center">
          <span className="text-4xl block mb-4">🔍</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No recipes found
          </h2>
          <p className="text-sm text-text-secondary">
            Try adjusting your search or filters.
          </p>
        </div>
      )}
    </div>
  );
}
