"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DbProfile } from "@/lib/types";

type Tab = "edit" | "following" | "followers" | "requests" | "search";

interface MiniProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_private?: boolean;
}

interface FollowRow {
  id: string;
  follower_id: string;
  followee_id: string;
  status: "pending" | "accepted";
  created_at: string;
  // Joined profile (depends on which side we're listing)
  profiles: MiniProfile | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(isOnboarding ? "edit" : "edit");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles/me")
      .then((r) => r.json())
      .then(({ profile }) => {
        if (cancelled || !profile) return;
        setProfile(profile);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="h-8 w-48 bg-bg-tertiary rounded-lg animate-pulse" />
        <div className="mt-6 glass rounded-2xl p-6 space-y-4">
          <div className="h-20 w-20 rounded-full bg-bg-tertiary animate-pulse" />
          <div className="h-4 w-2/3 bg-bg-tertiary rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-bg-tertiary rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="animate-fade-in">
        <p className="text-text-secondary">Profile not found.</p>
      </div>
    );
  }

  if (isOnboarding) {
    return (
      <ProfileEditor
        profile={profile}
        isOnboarding
        onSaved={(p) => {
          setProfile(p);
          router.push("/recipes");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl">👤</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {profile.display_name || profile.username}
          </h1>
          <p className="text-text-tertiary text-sm">@{profile.username}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-none border-b border-border">
        {(
          [
            ["edit", "Edit"],
            ["following", "Following"],
            ["followers", "Followers"],
            ["requests", "Requests"],
            ["search", "Find friends"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === id
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "edit" && (
        <ProfileEditor
          profile={profile}
          onSaved={(p) => {
            setProfile(p);
            router.refresh();
          }}
        />
      )}
      {tab === "following" && <FollowList kind="following" me={profile.id} />}
      {tab === "followers" && <FollowList kind="followers" me={profile.id} />}
      {tab === "requests" && <RequestsList me={profile.id} />}
      {tab === "search" && <SearchTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────

function ProfileEditor({
  profile,
  isOnboarding,
  onSaved,
}: {
  profile: DbProfile;
  isOnboarding?: boolean;
  onSaved: (p: DbProfile) => void;
}) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [isPrivate, setIsPrivate] = useState(profile.is_private);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `profiles/${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("meal-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("meal-photos").getPublicUrl(path);
      setAvatarUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          display_name: displayName,
          bio,
          is_private: isPrivate,
          avatar_url: avatarUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSavedAt(Date.now());
      onSaved(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-6 max-w-2xl">
      {isOnboarding && (
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-sm text-text-primary">
          Welcome! Pick a username so your friends can find you.
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-3xl">👤</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="px-4 py-2 rounded-xl bg-bg-tertiary border border-border text-sm text-text-secondary hover:bg-bg-secondary cursor-pointer disabled:opacity-50"
          >
            {uploadingAvatar ? "Uploading…" : "Change photo"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className="ml-2 px-3 py-2 rounded-xl text-sm text-text-tertiary hover:text-text-primary cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          Username
        </label>
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">@</span>
          <input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(
                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
              )
            }
            maxLength={30}
            className="flex-1 px-3 py-2 rounded-xl bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="your_handle"
          />
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          3–30 chars · lowercase letters, numbers, underscores
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          Display name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          className="w-full px-3 py-2 rounded-xl bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          rows={3}
          className="w-full px-3 py-2 rounded-xl bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
          placeholder="A short bio (optional)"
        />
        <p className="text-xs text-text-tertiary mt-1">{bio.length}/200</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-bg-tertiary/50 border border-border">
        <input
          id="is_private"
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded cursor-pointer"
        />
        <label htmlFor="is_private" className="cursor-pointer">
          <div className="text-sm font-medium text-text-primary">
            Private profile
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            When enabled, new followers must request to follow you.
          </div>
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-text-tertiary">
          {savedAt && !error ? "Saved ✓" : ""}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !username}
          className="px-5 py-2.5 rounded-xl bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving…" : isOnboarding ? "Continue" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Following / Followers list
// ─────────────────────────────────────────────────────────────

function FollowList({
  kind,
  me,
}: {
  kind: "following" | "followers";
  me: string;
}) {
  const [rows, setRows] = useState<FollowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const isFollowing = kind === "following";
    const filterCol = isFollowing ? "follower_id" : "followee_id";
    const otherCol = isFollowing ? "followee_id" : "follower_id";
    // Tell PostgREST exactly which FK to follow for the join
    const joinAlias = `profiles!follows_${otherCol}_fkey`;

    supabase
      .from("follows")
      .select(`*, profiles:${joinAlias}(id, username, display_name, avatar_url)`)
      .eq(filterCol, me)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as unknown as FollowRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, me]);

  if (loading)
    return <div className="text-sm text-text-tertiary">Loading…</div>;

  if (rows.length === 0)
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
        {kind === "following"
          ? "You're not following anyone yet."
          : "No followers yet."}
      </div>
    );

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const p = row.profiles;
        if (!p) return null;
        return (
          <Link
            key={row.id}
            href={`/profile/${p.username}`}
            className="glass rounded-xl p-3 flex items-center gap-3 hover:border-border-hover transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border overflow-hidden flex items-center justify-center shrink-0">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-base">👤</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {p.display_name || p.username}
              </div>
              <div className="text-xs text-text-tertiary truncate">
                @{p.username}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pending follow requests directed at me
// ─────────────────────────────────────────────────────────────

function RequestsList({ me }: { me: string }) {
  const [rows, setRows] = useState<FollowRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const supabase = createClient();
    return supabase
      .from("follows")
      .select(
        "*, profiles:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)"
      )
      .eq("followee_id", me)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data as unknown as FollowRow[]) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const respond = async (id: string, action: "accept" | "decline") => {
    const res = await fetch(`/api/follows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  if (loading)
    return <div className="text-sm text-text-tertiary">Loading…</div>;

  if (rows.length === 0)
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
        No pending requests.
      </div>
    );

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const p = row.profiles;
        if (!p) return null;
        return (
          <div
            key={row.id}
            className="glass rounded-xl p-3 flex items-center gap-3"
          >
            <Link
              href={`/profile/${p.username}`}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border overflow-hidden flex items-center justify-center shrink-0">
                {p.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base">👤</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {p.display_name || p.username}
                </div>
                <div className="text-xs text-text-tertiary truncate">
                  @{p.username}
                </div>
              </div>
            </Link>
            <button
              onClick={() => respond(row.id, "accept")}
              className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white font-medium hover:opacity-90 cursor-pointer"
            >
              Accept
            </button>
            <button
              onClick={() => respond(row.id, "decline")}
              className="px-3 py-1.5 rounded-lg text-xs bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Decline
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────

function SearchTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MiniProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setResults(data.profiles ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username or name…"
        className="w-full px-4 py-2.5 rounded-xl bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      {loading && <div className="text-sm text-text-tertiary">Searching…</div>}

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="text-sm text-text-tertiary">No matches.</div>
      )}

      <div className="space-y-2">
        {results.map((p) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            className="glass rounded-xl p-3 flex items-center gap-3 hover:border-border-hover transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border overflow-hidden flex items-center justify-center shrink-0">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-base">👤</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {p.display_name || p.username}
              </div>
              <div className="text-xs text-text-tertiary truncate">
                @{p.username}
                {p.is_private ? " · private" : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
