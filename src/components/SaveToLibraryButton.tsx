"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Variant = "primary" | "compact";

interface Props {
  recipeId: string;
  variant?: Variant;
  /** When provided, used as the destination after a successful fork. */
  redirectAfter?: boolean;
}

/**
 * "Save to my library" — POSTs /api/recipes/[id]/fork.
 *
 * The fork is idempotent on the server (same source-recipe → returns the
 * existing copy), so re-clicking is safe and just re-navigates if requested.
 */
export default function SaveToLibraryButton({
  recipeId,
  variant = "primary",
  redirectAfter = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/fork`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fork failed");
      setDone(true);
      if (redirectAfter) {
        router.push(`/recipes/${data.recipe.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fork failed");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || done}
        title={error ?? "Save to my library"}
        className="px-3 py-1.5 rounded-lg text-xs bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-60"
      >
        {busy ? "Saving…" : done ? "Saved ✓" : "Save to my library"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || done}
      className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-60"
    >
      {busy ? "Saving…" : done ? "Saved ✓" : "Save to my library"}
    </button>
  );
}
