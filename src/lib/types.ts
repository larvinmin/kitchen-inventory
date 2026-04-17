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
  extractionMethod: "caption" | "video" | "manual";
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
  // Nullable: a cook session is a historical event that survives the
  // deletion of its source recipe. When the recipe is removed from the
  // user's library, the FK clears to null and the UI falls back to the
  // snapshot fields below.
  recipe_id: string | null;
  variant_recipe_id: string | null;
  notes: string | null;
  photo_url: string | null;
  rating_category: RatingCategory | null;
  rating_rank: number | null;
  rating_score: number | null;
  modified_instructions: string[] | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  // Denormalized snapshot, populated by a BEFORE INSERT/UPDATE trigger
  // (see migration 012). Lets cook log entries render after the source
  // recipe is deleted or renamed.
  recipe_title: string | null;
  recipe_thumbnail: string | null;
  recipe_tags: string[] | null;
}

export type CookSubstitutionType = "swap" | "addition" | "deletion";

export interface DbCookSubstitution {
  id: string;
  cook_session_id: string;
  original_recipe_ingredient_id: string | null;
  original_ingredient_name: string | null;
  original_amount: string | null;
  original_unit: string | null;
  substitute_ingredient_name: string;
  substitute_amount: string | null;
  substitute_unit: string | null;
  substitute_notes: string | null;
  sub_type: CookSubstitutionType;
}

// Joined session with recipe info for display.
// `recipes` is null when the source recipe has been deleted from the
// user's library; consumers should fall back to the snapshot fields
// (`recipe_title`, `recipe_thumbnail`, `recipe_tags`) on `DbCookSession`.
export interface CookSessionWithRecipe extends DbCookSession {
  recipes: Pick<DbRecipe, "id" | "title" | "source_thumbnail" | "tags"> | null;
}

// Full detail including substitutions. `recipes` is null when the source
// recipe has been deleted (see CookSessionWithRecipe above).
export interface CookSessionDetail extends DbCookSession {
  recipes: DbRecipe | null;
  cook_substitutions: DbCookSubstitution[];
}

// For the pairwise comparison UI
export interface RankingComparison {
  session: CookSessionWithRecipe;
  question: string; // "Was this meal better or worse?"
}

// Ingredient with optional substitution overlay (for cooking mode)
export interface CookingIngredient {
  recipeIngredientId?: string;
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

// ─── Inventory types ─────────────────────────────────────

export interface DbInventoryItem {
  id: string;
  user_id: string;
  ingredient_id: string;
  amount: string | null;
  unit: string | null;
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Joined inventory item with ingredient details for display
export interface InventoryItemWithIngredient extends DbInventoryItem {
  ingredients: DbIngredient;
}

// Constant list of categories for Inventory bucketing
export const INVENTORY_CATEGORIES = [
  "Meat",
  "Seafood",
  "Breads",
  "Dairy",
  "Fruit & Vegetable",
  "Spices & Seasoning",
  "Pantry",
  "Other"
] as const;

export type InventoryCategory = typeof INVENTORY_CATEGORIES[number];

// Type for ingredients scanned via Gemini
export interface ScannedIngredient {
  id: string; // Generated on the client to track items easily
  name: string;
  category: string;
  amount: string;
  unit: string;
  expires_at: string; // YYYY-MM-DD
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] mapped 0-1000
}

export interface DbGroceryListItem {
  id: string; // uuid
  user_id: string; // uuid
  name: string;
  amount: string | null;
  unit: string | null;
  created_at: string;
}

// ─── Social / Friends types ──────────────────────────────────

export interface DbProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean;
  username_customized: boolean;
  created_at: string;
  updated_at: string;
}

export type FollowStatus = "pending" | "accepted";

export interface DbFollow {
  id: string;
  follower_id: string;
  followee_id: string;
  status: FollowStatus;
  created_at: string;
  accepted_at: string | null;
}

export type NotificationType =
  | "follow_request"
  | "follow_accepted"
  | "recipe_cooked";

export interface DbNotification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  // Polymorphic reference: a follow id, cook session id, or recipe id depending on type.
  subject_id: string | null;
  // Denormalized snippets so notification rendering doesn't need joins.
  metadata: {
    actor_username?: string;
    actor_display_name?: string | null;
    actor_avatar_url?: string | null;
    recipe_id?: string;
    recipe_title?: string;
    recipe_thumbnail?: string | null;
    cook_session_id?: string;
    [k: string]: unknown;
  };
  read_at: string | null;
  created_at: string;
}

// Used by feed cards: a cook session enriched with the cook's profile.
export interface FeedItem extends CookSessionWithRecipe {
  profiles: Pick<DbProfile, "id" | "username" | "display_name" | "avatar_url">;
}
