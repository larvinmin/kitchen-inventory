// ─── Recipe types ────────────────────────────────────────────

export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
  notes?: string;
}

export interface ParsedRecipe {
  title: string;
  description?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  sourceUrl: string;
  sourcePlatform: "instagram" | "youtube" | "tiktok" | "manual";
  sourceThumbnail?: string;
  extractionMethod: "caption" | "video";
}

// Database row shapes (from Supabase)
export interface DbRecipe {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  instructions: string[];
  tags: string[];
  source_url: string | null;
  source_platform: string | null;
  source_thumbnail: string | null;
  is_favorite: boolean;
  want_to_make: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbIngredient {
  id: string;
  name: string;
  category: string | null;
  created_by: string | null;
}

export interface DbRecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  amount: string | null;
  unit: string | null;
  notes: string | null;
  order_index: number;
}

// Joined recipe with ingredients for display
export interface RecipeWithIngredients extends DbRecipe {
  recipe_ingredients: (DbRecipeIngredient & {
    ingredients: DbIngredient;
  })[];
}

// ─── API types ───────────────────────────────────────────────

export interface ImportRequest {
  url: string;
}

export interface ImportResponse {
  success: boolean;
  recipe?: ParsedRecipe;
  error?: string;
  extractionMethod?: "caption" | "video";
}

// ─── Apify types ─────────────────────────────────────────────

export interface ApifyReelResult {
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  ownerUsername: string;
  transcript: string; // Auto-generated transcript from Apify
}

// ─── Cooking Session types ───────────────────────────────────

export type RatingCategory = "bad" | "ok" | "good";

export interface DbCookSession {
  id: string;
  user_id: string;
  recipe_id: string;
  variant_recipe_id: string | null;
  notes: string | null;
  photo_url: string | null;
  rating_category: RatingCategory | null;
  rating_rank: number | null;
  rating_score: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface DbCookSubstitution {
  id: string;
  cook_session_id: string;
  original_recipe_ingredient_id: string | null;
  original_ingredient_name: string;
  original_amount: string | null;
  original_unit: string | null;
  substitute_ingredient_name: string;
  substitute_amount: string | null;
  substitute_unit: string | null;
  substitute_notes: string | null;
}

// Joined session with recipe info for display
export interface CookSessionWithRecipe extends DbCookSession {
  recipes: Pick<DbRecipe, "id" | "title" | "source_thumbnail" | "tags">;
}

// Full detail including substitutions
export interface CookSessionDetail extends DbCookSession {
  recipes: DbRecipe;
  cook_substitutions: DbCookSubstitution[];
}

// For the pairwise comparison UI
export interface RankingComparison {
  session: CookSessionWithRecipe;
  question: string; // "Was this meal better or worse?"
}

// Ingredient with optional substitution overlay (for cooking mode)
export interface CookingIngredient {
  recipeIngredientId: string;
  originalName: string;
  originalAmount: string;
  originalUnit: string;
  originalNotes: string;
  // Substitution (if user swapped)
  substituteName?: string;
  substituteAmount?: string;
  substituteUnit?: string;
  substituteNotes?: string;
  isSubstituted: boolean;
}
