"use client";

import { useState } from "react";
import type { FollowStatus } from "@/lib/types";

export type FollowState = "none" | "pending" | "accepted";

interface Props {
  followeeId: string;
  initialState: FollowState;
  onChange?: (next: FollowState) => void;
}

const stateFromStatus = (status: FollowStatus | null | undefined): FollowState =>
  status === "accepted" ? "accepted" : status === "pending" ? "pending" : "none";

/**
 * State machine:
 *   none      → click → POST /api/follows → 'pending' or 'accepted'
 *   pending   → click → DELETE /api/follows  (cancel request)
 *   accepted  → click → DELETE /api/follows  (unfollow, with confirm)
 */
export default function FollowButton({
  followeeId,
  initialState,
  onChange,
}: Props) {
  const [state, setState] = useState<FollowState>(initialState);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const update = (next: FollowState) => {
    setState(next);
    onChange?.(next);
  };

  const follow = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followee_id: followeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Follow failed");
      update(stateFromStatus(data.follow.status));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const unfollowOrCancel = async () => {
    if (state === "accepted" && !confirm("Unfollow this user?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/follows?followee_id=${followeeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Unfollow failed");
      }
      update("none");
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  let label = "Follow";
  let onClick = follow;
  let className =
    "px-5 py-2 rounded-xl bg-accent text-white font-medium hover:opacity-90";

  if (state === "pending") {
    label = "Requested";
    onClick = unfollowOrCancel;
    className =
      "px-5 py-2 rounded-xl bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary";
  } else if (state === "accepted") {
    label = hover ? "Unfollow" : "Following";
    onClick = unfollowOrCancel;
    className =
      "px-5 py-2 rounded-xl bg-bg-tertiary border border-border text-text-primary";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={busy}
      className={`${className} text-sm cursor-pointer disabled:opacity-50 transition-all`}
    >
      {busy ? "…" : label}
    </button>
  );
}
