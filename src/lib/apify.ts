import type { ApifyReelResult } from "@/lib/types";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify~instagram-reel-scraper";

function getToken() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set");
  return token;
}

/**
 * Scrape an Instagram Reel using Apify's REST API directly.
 * Avoids the apify-client SDK which has bundling issues with Turbopack.
 */
export async function scrapeInstagramReel(
  reelUrl: string
): Promise<ApifyReelResult> {
  const token = getToken();

  // Step 1: Start the actor run and wait for it to finish (synchronous mode)
  // Adding ?waitForFinish=120 makes this a blocking call — Apify holds the
  // connection open and returns the run object once it completes (or times out).
  const runResponse = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?waitForFinish=120`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // The field is called "username" but it accepts direct reel URLs too
        // (per the actor's input schema: "Add Instagram usernames, profile URLs, IDs, or direct reel URLs")
        username: [reelUrl],
        resultsLimit: 1,
      }),
    }
  );

  if (!runResponse.ok) {
    const errorText = await runResponse.text().catch(() => "unknown error");
    throw new Error(
      `Apify API error (${runResponse.status}): ${errorText}`
    );
  }

  const runData = await runResponse.json();
  const run = runData.data;

  if (!run || run.status !== "SUCCEEDED") {
    throw new Error(
      `Apify run did not succeed. Status: ${run?.status ?? "unknown"}, statusMessage: ${run?.statusMessage ?? "none"}`
    );
  }

  // Step 2: Fetch results from the default dataset
  const datasetResponse = await fetch(
    `${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?format=json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!datasetResponse.ok) {
    throw new Error(
      `Failed to fetch dataset (${datasetResponse.status})`
    );
  }

  const items = (await datasetResponse.json()) as Record<string, unknown>[];

  if (!items || items.length === 0) {
    throw new Error(
      "No results returned from Apify. The Reel may be private or the URL is invalid."
    );
  }

  const item = items[0];
  const images = (item.images as string[] | undefined) ?? [];

  return {
    caption: (item.caption as string) || "",
    videoUrl: (item.videoUrl as string) || "",
    thumbnailUrl:
      (item.displayUrl as string) ||
      images[0] ||
      (item.thumbnailUrl as string) ||
      "",
    ownerUsername: (item.ownerUsername as string) || "",
    transcript: (item.transcript as string) || "",
  };
}

/**
 * Validate that a URL is a valid Instagram Reel URL
 */
export function isValidInstagramReelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isInstagram =
      parsed.hostname === "www.instagram.com" ||
      parsed.hostname === "instagram.com";
    const isReel =
      parsed.pathname.startsWith("/reel/") ||
      parsed.pathname.startsWith("/reels/") ||
      parsed.pathname.startsWith("/p/");
    return isInstagram && isReel;
  } catch {
    return false;
  }
}
