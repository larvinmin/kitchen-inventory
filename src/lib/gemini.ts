import { GoogleGenAI, Type } from "@google/genai";
import type { ParsedRecipe, RecipeIngredient } from "@/lib/types";

function getAI() {
  // Support both Vertex AI and AI Studio depending on env vars
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    // Vertex AI mode — uses Application Default Credentials
    // (run `gcloud auth application-default login` locally)
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    });
  }

  // AI Studio fallback — uses API key
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
}

const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Recipe title" },
    description: {
      type: Type.STRING,
      description: "Brief description of the dish",
    },
    servings: {
      type: Type.STRING,
      description: 'Number of servings, e.g. "4 servings"',
    },
    prepTime: { type: Type.STRING, description: 'e.g. "15 min"' },
    cookTime: { type: Type.STRING, description: 'e.g. "30 min"' },
    totalTime: { type: Type.STRING, description: 'e.g. "45 min"' },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Ingredient name" },
          amount: {
            type: Type.STRING,
            description: 'Quantity, e.g. "2", "1/2"',
          },
          unit: {
            type: Type.STRING,
            description: 'Unit of measure, e.g. "cups", "tbsp"',
          },
          notes: {
            type: Type.STRING,
            description: 'Preparation notes, e.g. "finely diced", "optional"',
          },
        },
        required: ["name"],
      },
    },
    instructions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step-by-step cooking instructions",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Cuisine type, dietary tags, meal type. e.g. ['italian', 'pasta', 'dinner', 'vegetarian']",
    },
  },
  required: ["title", "ingredients", "instructions"],
};

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Your job is to extract structured recipe data from cooking content.

Rules:
- Extract the recipe title, ingredients with amounts/units, and step-by-step instructions
- If amounts or units are not specified, use your best estimate or leave them empty
- Break down complex instructions into clear, numbered steps
- Infer relevant tags (cuisine type, dietary info, meal type, cooking method)
- If the content does not appear to be a recipe, still try to extract any cooking-related information
- Keep ingredient names clean and standardized (e.g. "chicken breast" not "the chicken")
- For vague measurements like "a pinch" or "to taste", put that in the notes field`;

/**
 * Extract a recipe from Instagram caption text (and optional transcript) using Gemini.
 * Returns null if extraction fails or content is not a recipe.
 */
export async function extractRecipeFromCaption(
  caption: string,
  transcript?: string
): Promise<ParsedRecipe | null> {
  // Need at least some meaningful text
  const combined = [caption, transcript].filter(Boolean).join("\n\n").trim();
  if (combined.length < 20) {
    return null;
  }

  const promptParts = [];
  if (caption?.trim()) {
    promptParts.push(`Caption:\n${caption}`);
  }
  if (transcript?.trim()) {
    promptParts.push(`Spoken transcript (auto-generated):\n${transcript}`);
  }

  const prompt = `Extract the recipe from this Instagram Reel content:\n\n${promptParts.join("\n\n")}`;

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RECIPE_SCHEMA,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);

    // Validate minimum requirements
    if (
      !parsed.title ||
      !parsed.ingredients ||
      parsed.ingredients.length === 0
    ) {
      return null;
    }

    return {
      title: parsed.title,
      description: parsed.description || "",
      servings: parsed.servings || "",
      prepTime: parsed.prepTime || "",
      cookTime: parsed.cookTime || "",
      totalTime: parsed.totalTime || "",
      ingredients: (parsed.ingredients as RecipeIngredient[]).map(
        (ing: RecipeIngredient) => ({
          name: ing.name || "",
          amount: ing.amount || "",
          unit: ing.unit || "",
          notes: ing.notes || "",
        })
      ),
      instructions: parsed.instructions || [],
      tags: parsed.tags || [],
      sourceUrl: "",
      sourcePlatform: "instagram",
      extractionMethod: "caption",
    };
  } catch (error) {
    console.error("Caption extraction failed:", error);
    return null;
  }
}

/**
 * Extract a recipe from video content using Gemini's video understanding.
 * Downloads the video and sends it to Gemini for full visual + audio analysis.
 */
export async function extractRecipeFromVideo(
  videoUrl: string
): Promise<ParsedRecipe | null> {
  if (!videoUrl) return null;

  try {
    // Download the video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error("Failed to download video:", videoResponse.statusText);
      return null;
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString("base64");

    // Determine mime type (Instagram videos are typically mp4)
    const mimeType = "video/mp4";

    const response = await getAI().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: videoBase64,
              },
            },
            {
              text: "Watch this cooking video carefully. Extract the full recipe including all ingredients with quantities and step-by-step cooking instructions. Pay attention to both what is said (audio) and what is shown (visual ingredients, measurements, techniques).",
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RECIPE_SCHEMA,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);

    if (
      !parsed.title ||
      !parsed.ingredients ||
      parsed.ingredients.length === 0
    ) {
      return null;
    }

    return {
      title: parsed.title,
      description: parsed.description || "",
      servings: parsed.servings || "",
      prepTime: parsed.prepTime || "",
      cookTime: parsed.cookTime || "",
      totalTime: parsed.totalTime || "",
      ingredients: (parsed.ingredients as RecipeIngredient[]).map(
        (ing: RecipeIngredient) => ({
          name: ing.name || "",
          amount: ing.amount || "",
          unit: ing.unit || "",
          notes: ing.notes || "",
        })
      ),
      instructions: parsed.instructions || [],
      tags: parsed.tags || [],
      sourceUrl: "",
      sourcePlatform: "instagram",
      extractionMethod: "video",
    };
  } catch (error) {
    console.error("Video extraction failed:", error);
    return null;
  }
}

/**
 * Check if a caption-extracted recipe is "complete enough" or if we should
 * escalate to video processing.
 */
export function isRecipeComplete(recipe: ParsedRecipe): boolean {
  const hasEnoughIngredients = recipe.ingredients.length >= 2;
  const hasInstructions = recipe.instructions.length >= 1;
  const hasTitle = recipe.title.length > 0;

  return hasTitle && hasEnoughIngredients && hasInstructions;
}
