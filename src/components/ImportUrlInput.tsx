"use client";

import { useState } from "react";

interface ImportUrlInputProps {
  onImport: (url: string) => void;
  loading: boolean;
}

export default function ImportUrlInput({
  onImport,
  loading,
}: ImportUrlInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isInstagramUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.hostname === "www.instagram.com" ||
        parsed.hostname === "instagram.com"
      );
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    if (!isInstagramUrl(url)) {
      setError("Please enter a valid Instagram Reel URL");
      return;
    }

    onImport(url.trim());
  };

  const showInstagramIcon = url.length > 0 && isInstagramUrl(url);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        {/* Platform Icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
          {showInstagramIcon ? (
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center animate-scale-in">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </div>
          ) : (
            <svg
              className="w-5 h-5 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-1.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 6.83"
              />
            </svg>
          )}
        </div>

        {/* Input */}
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="Paste an Instagram Reel URL..."
          disabled={loading}
          className="w-full pl-14 pr-36 py-4 rounded-2xl bg-bg-secondary border border-border text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none text-sm disabled:opacity-50"
        />

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-accent text-text-inverse font-semibold text-sm hover:bg-accent-hover transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
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
              Importing...
            </span>
          ) : (
            "Import Recipe"
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-error animate-slide-down">{error}</p>
      )}

      <p className="mt-3 text-xs text-text-tertiary">
        Currently supports Instagram Reels. YouTube Shorts and TikTok coming
        soon.
      </p>
    </form>
  );
}
