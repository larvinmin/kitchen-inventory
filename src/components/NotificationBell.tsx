"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DbNotification } from "@/lib/types";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications ?? []);
        setUnread(data.unread_count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + Realtime subscription scoped to my recipient_id.
  // RLS already filters rows server-side, so this filter is purely an
  // efficiency hint to avoid receiving payloads for other users.
  //
  // The channel name is uniquified per mount because supabase-js caches
  // channels by name — under React Strict Mode the second mount would
  // otherwise reuse the first (still-subscribed) channel and `.on()` would
  // throw "cannot add postgres_changes callbacks after subscribe()".
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      await load();
      if (cancelled) return;

      const channelName = `notifications:${user.id}:${Math.random()
        .toString(36)
        .slice(2)}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as DbNotification;
            setNotifications((prev) => [row, ...prev].slice(0, 30));
            setUnread((u) => u + 1);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    if (unread === 0) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    );
    setUnread(0);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
        aria-label="Notifications"
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
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden glass rounded-2xl border border-border shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-bg-primary/95 backdrop-blur">
            <h3 className="text-sm font-semibold text-text-primary">
              Notifications
            </h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-accent hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {loading && notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-tertiary">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-tertiary">
              No notifications yet.
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onClick,
}: {
  notification: DbNotification;
  onClick: () => void;
}) {
  const meta = n.metadata || {};
  const actorName =
    (meta.actor_display_name as string) ||
    (meta.actor_username as string) ||
    "Someone";
  const actorUsername = meta.actor_username as string | undefined;
  const avatar = meta.actor_avatar_url as string | null | undefined;

  let body: React.ReactNode = null;
  let href = "#";

  switch (n.type) {
    case "follow_request":
      body = (
        <>
          <strong className="text-text-primary">{actorName}</strong>
          <span className="text-text-secondary"> requested to follow you.</span>
        </>
      );
      href = "/profile";
      break;
    case "follow_accepted":
      body = (
        <>
          <strong className="text-text-primary">{actorName}</strong>
          <span className="text-text-secondary"> is now following you.</span>
        </>
      );
      href = actorUsername ? `/profile/${actorUsername}` : "/profile";
      break;
    case "recipe_cooked":
      body = (
        <>
          <strong className="text-text-primary">{actorName}</strong>
          <span className="text-text-secondary"> cooked your recipe </span>
          <strong className="text-text-primary">
            {(meta.recipe_title as string) || "a recipe"}
          </strong>
          <span className="text-text-secondary">.</span>
        </>
      );
      href = meta.cook_session_id
        ? `/cook-log/${meta.cook_session_id}`
        : "/cook-log";
      break;
  }

  const ago = relativeTime(new Date(n.created_at));

  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={`block px-4 py-3 border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors ${
          !n.read_at ? "bg-accent/5" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center shrink-0">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-sm">👤</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug">{body}</p>
            <p className="text-xs text-text-tertiary mt-1">{ago}</p>
          </div>
          {!n.read_at && (
            <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
          )}
        </div>
      </Link>
    </li>
  );
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
