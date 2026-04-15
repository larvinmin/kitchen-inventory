import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeInstagramReel, isValidInstagramReelUrl } from "@/lib/apify";
import {
  extractRecipeFromCaption,
  extractRecipeFromVideo,
  isRecipeComplete,
} from "@/lib/gemini";
import type { ImportRequest, ImportResponse } from "@/lib/types";

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json<ImportResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request
    const body = (await request.json()) as ImportRequest;
    const { url } = body;

    if (!url) {
      return NextResponse.json<ImportResponse>(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL
    if (!isValidInstagramReelUrl(url)) {
      return NextResponse.json<ImportResponse>(
        {
          success: false,
          error:
            "Invalid Instagram Reel URL. Please provide a URL like https://www.instagram.com/reel/...",
        },
        { status: 400 }
      );
    }

    // Step 1: Scrape the Reel with Apify
    let reelData;
    try {
      reelData = await scrapeInstagramReel(url);
    } catch (error) {
      console.error("Apify scrape failed:", error);
      return NextResponse.json<ImportResponse>(
        {
          success: false,
          error:
            "Failed to scrape the Instagram Reel. It may be private or the URL is invalid.",
        },
        { status: 422 }
      );
    }

    // Step 2: Try caption extraction first (fast + cheap)
    // Include transcript (Apify's auto-generated speech-to-text) as additional context
    let recipe = await extractRecipeFromCaption(reelData.caption, reelData.transcript);
    let extractionMethod: "caption" | "video" = "caption";

    // Step 3: If caption extraction failed or is incomplete, try video
    if (!recipe || !isRecipeComplete(recipe)) {
      console.log(
        "Caption extraction insufficient, falling back to video comprehension..."
      );

      if (reelData.videoUrl) {
        const videoRecipe = await extractRecipeFromVideo(reelData.videoUrl);
        if (videoRecipe) {
          recipe = videoRecipe;
          extractionMethod = "video";
        }
      }
    }

    // If both methods failed
    if (!recipe) {
      return NextResponse.json<ImportResponse>(
        {
          success: false,
          error:
            "Could not extract a recipe from this Reel. The content may not contain a recognizable recipe. You can try adding the recipe manually.",
        },
        { status: 422 }
      );
    }

    // Attach source info
    recipe.sourceUrl = url;
    recipe.sourcePlatform = "instagram";
    recipe.sourceThumbnail = reelData.thumbnailUrl;
    recipe.extractionMethod = extractionMethod;

    return NextResponse.json<ImportResponse>({
      success: true,
      recipe,
      extractionMethod,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json<ImportResponse>(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
