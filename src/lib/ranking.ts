import type { RatingCategory } from "@/lib/types";

/**
 * Beli-style ranking engine.
 *
 * Three categories map to score ranges:
 *   bad:  0.0 – 3.3
 *   ok:   3.3 – 6.7
 *   good: 6.7 – 10.0
 *
 * Within each category, scores are distributed along a bell curve
 * (normal distribution) so the middle positions cluster toward the
 * center of the range and edges taper off.
 */

const CATEGORY_RANGES: Record<RatingCategory, { min: number; max: number }> = {
  bad: { min: 0.0, max: 3.3 },
  ok: { min: 3.3, max: 6.7 },
  good: { min: 6.7, max: 10.0 },
};

/**
 * Approximate the inverse CDF (percent-point function) of a standard
 * normal distribution using the rational approximation by
 * Abramowitz & Stegun. Good enough for our ranking use case.
 */
function normalInverseCDF(p: number): number {
  // Clamp to avoid infinities
  const clamped = Math.max(0.001, Math.min(0.999, p));

  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.383577518672690e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239e0;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838e0;
  const c4 = -2.549732539343734e0;
  const c5 = 4.374664141464968e0;
  const c6 = 2.938163982698783e0;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996e0;
  const d4 = 3.754408661907416e0;

  const pLow = 0.02425;
  const pHigh = 1.0 - pLow;

  let q: number, r: number;

  if (clamped < pLow) {
    q = Math.sqrt(-2 * Math.log(clamped));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  } else if (clamped <= pHigh) {
    q = clamped - 0.5;
    r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - clamped));
    return -(
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
}

/**
 * Compute scores for all items in a category based on their rank position.
 *
 * Uses a bell-curve (normal distribution) mapping:
 * - Each position gets a percentile from evenly-spaced quantiles
 * - The percentile is mapped through the inverse normal CDF
 * - The result is scaled to fit within the category's score range
 *
 * @param count - Total number of items in the category
 * @param category - "bad" | "ok" | "good"
 * @returns Array of scores indexed by rank (0 = best in category)
 */
export function computeCategoryScores(
  count: number,
  category: RatingCategory
): number[] {
  if (count === 0) return [];
  const { min, max } = CATEGORY_RANGES[category];

  if (count === 1) {
    // Single item gets the midpoint
    return [Number(((min + max) / 2).toFixed(1))];
  }

  const scores: number[] = [];

  // Generate evenly-spaced quantiles for a bell curve
  // We use quantiles from 0.05 to 0.95 to avoid extreme tails
  const quantileMin = 0.05;
  const quantileMax = 0.95;

  // Get the z-scores for our quantile range
  const zMin = normalInverseCDF(quantileMin);
  const zMax = normalInverseCDF(quantileMax);

  for (let i = 0; i < count; i++) {
    // Position as a fraction (0 = best/highest score, 1 = worst/lowest)
    const fraction = count === 1 ? 0.5 : i / (count - 1);

    // Map to quantile range
    const quantile = quantileMin + fraction * (quantileMax - quantileMin);

    // Get the z-score (bell curve position)
    const z = normalInverseCDF(quantile);

    // Normalize z to 0-1 range within our quantile bounds
    const normalized = (z - zMin) / (zMax - zMin);

    // Map to category range (inverted: rank 0 = highest score)
    const score = max - normalized * (max - min);

    scores.push(Number(score.toFixed(1)));
  }

  return scores;
}

/**
 * Find the insertion position for a new item using binary search.
 * Used during pairwise comparison — returns which existing items
 * to compare against.
 *
 * @param totalInCategory - How many items exist in the category
 * @returns Object with helpers for the binary search process
 */
export function createBinarySearch(totalInCategory: number) {
  let low = 0;
  let high = totalInCategory; // can insert at end

  return {
    /** Get the current midpoint index to compare against */
    getMidpoint(): number | null {
      if (low >= high) return null; // search complete
      return Math.floor((low + high) / 2);
    },

    /** User said new meal is BETTER than the meal at midpoint */
    better() {
      const mid = Math.floor((low + high) / 2);
      high = mid;
    },

    /** User said new meal is WORSE than the meal at midpoint */
    worse() {
      const mid = Math.floor((low + high) / 2);
      low = mid + 1;
    },

    /** Get the final insertion rank */
    getInsertionRank(): number {
      return low;
    },

    /** Check if comparison is complete */
    isComplete(): boolean {
      return low >= high;
    },
  };
}

/**
 * Get the category boundaries for drag-and-drop reordering.
 * Returns the index ranges for each category in a sorted list.
 */
export function getCategoryForScore(score: number): RatingCategory {
  if (score < 3.3) return "bad";
  if (score < 6.7) return "ok";
  return "good";
}

/**
 * After a reorder (drag-and-drop), determine which category each
 * item should belong to based on the boundary items.
 *
 * Boundary rules:
 * - Track top and bottom item of each category
 * - If an item is dragged above the top of a higher category, it moves up
 * - If dragged below the bottom of a lower category, it moves down
 * - If the boundary item itself moves, the next item becomes the new boundary
 */
export function recalculateAfterReorder(
  sessions: { id: string; rating_category: RatingCategory; rating_rank: number }[],
  newOrder: string[] // session IDs in new display order (best first)
): { id: string; rating_category: RatingCategory; rating_rank: number; rating_score: number }[] {
  // Count items per category to maintain proportions
  const categoryCounts: Record<RatingCategory, number> = { good: 0, ok: 0, bad: 0 };
  for (const s of sessions) {
    categoryCounts[s.rating_category]++;
  }

  // Build category assignment: maintain same counts, just reassign based on new order
  // Items maintain their category unless they cross a boundary
  const categoryMap = new Map<string, RatingCategory>();
  for (const s of sessions) {
    categoryMap.set(s.id, s.rating_category);
  }

  // Find boundary positions in old order
  // The new order preserves categories unless items cross boundaries
  // For simplicity: assign categories based on the cumulative counts
  // good items first, then ok, then bad
  const result: { id: string; rating_category: RatingCategory; rating_rank: number; rating_score: number }[] = [];

  const goodCount = categoryCounts.good;
  const okCount = categoryCounts.ok;

  const categoryRanks: Record<RatingCategory, number> = { good: 0, ok: 0, bad: 0 };

  for (let i = 0; i < newOrder.length; i++) {
    const id = newOrder[i];
    let category: RatingCategory;

    if (i < goodCount) {
      category = "good";
    } else if (i < goodCount + okCount) {
      category = "ok";
    } else {
      category = "bad";
    }

    const rank = categoryRanks[category]++;
    result.push({ id, rating_category: category, rating_rank: rank, rating_score: 0 });
  }

  // Recompute scores per category
  const byCategory: Record<RatingCategory, typeof result> = { good: [], ok: [], bad: [] };
  for (const item of result) {
    byCategory[item.rating_category].push(item);
  }

  for (const cat of ["good", "ok", "bad"] as RatingCategory[]) {
    const items = byCategory[cat];
    const scores = computeCategoryScores(items.length, cat);
    for (let i = 0; i < items.length; i++) {
      items[i].rating_score = scores[i];
      items[i].rating_rank = i;
    }
  }

  return result;
}
