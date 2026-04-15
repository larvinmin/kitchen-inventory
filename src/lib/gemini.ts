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

const INVENTORY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Detailed ingredient name" },
      category: {
        type: Type.STRING,
        description: "The category this item belongs to",
        enum: ["Meat", "Seafood", "Breads", "Dairy", "Fruit & Vegetable", "Spices & Seasoning", "Pantry", "Other"]
      },
      amount: { type: Type.STRING, description: 'Quantity (e.g., "1", "approx 2", "0.5")' },
      unit: { type: Type.STRING, description: 'Unit (e.g., "lbs", "packet", "bunch", "cloves")' },
      expires_at: { type: Type.STRING, description: "Estimated expiration date based on today's date in YYYY-MM-DD format" },
      box_2d: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER },
        description: "2D bounding box of the item in the image, strictly in [ymin, xmin, ymax, xmax] format. Coordinates must be integers normalized between 0 and 1000."
      }
    },
    required: ["name", "category", "amount", "unit", "expires_at", "box_2d"]
  }
};

/**
 * Scan an image of groceries/inventory using Gemini.
 * Returns an array of detected items with their amounts, units, and bounding boxes.
 */
export async function scanInventory(imageBase64: string, mimeType: string) {
  const ai = getAI();
  const model = "gemini-2.5-flash"; // Flash is excellent at spatial understanding

  const today = new Date().toISOString().split("T")[0];
  const prompt = `Identify all grocery items, ingredients, and food products in this image.
For each item, determine its name, approximate amount, and unit.
Categorize each item strictly into one of: 'Meat', 'Seafood', 'Breads', 'Dairy', 'Fruit & Vegetable', 'Spices & Seasoning', 'Pantry', or 'Other'.
Today is ${today}. Based on general knowledge, estimate an expiration date for each item in YYYY-MM-DD format.
Crucially, you must return the 2D bounding box outlining where the item appears in the image.
Return bounding boxes in [ymin, xmin, ymax, xmax] format scaled from 0 to 1000.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: INVENTORY_SCHEMA,
        temperature: 0.2, // Lower temperature for more grounded detection
      },
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text);
  } catch (err) {
    console.error("Inventory scan failed:", err);
    throw err;
  }
}

const DEDUCT_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      inventory_item_id: { type: Type.STRING },
      new_amount: { type: Type.STRING },
      new_unit: { type: Type.STRING },
      action: { type: Type.STRING, enum: ["UPDATE", "DELETE"] }
    },
    required: ["inventory_item_id", "action"]
  }
};

/**
 * Automatically calculate remaining inventory quantities via LLM deduction math.
 */
export async function deductInventory(
  payload: {
    inventory_item_id: string;
    original_amount: string;
    original_unit: string;
    ingredient_name: string;
    category: string;
    consumed_amount: string;
    consumed_unit: string;
  }[]
): Promise<{ inventory_item_id: string; new_amount?: string; new_unit?: string; action: "UPDATE" | "DELETE" }[] | null> {
  const ai = getAI();
  const prompt = `You are a kitchen inventory manager. Calculate the remaining stock after a cooking session.
I will give you a list of ingredients that were consumed, mapped to the user's original inventory string.

Rules:
1. For Meats/Seafood: Use logic to subtract weight or quantity. If 2 steaks are owned, and 1 is consumed, 1 steak is remaining.
2. For Fruits/Vegetables: Do literal subtraction of the amount logic.
3. For Dairy: Deduct fractional or literal volumes (e.g. 1 gallon - 1/2 gallon -> half a gallon left).
4. If the new amount hits 0, or is negative, action MUST be "DELETE". Otherwise, action is "UPDATE" and return the new_amount and new_unit. Keep strings naturally worded if fractions are hard.

Input array of items cooked:
${JSON.stringify(payload, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: DEDUCT_SCHEMA,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.error("Inventory deduction failed:", err);
    throw err;
  }
}

const GROCERY_MERGE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["UPDATE", "INSERT"] },
      target_id: { type: Type.STRING, description: "If UPDATE, the id of the existing grocery item" },
      name: { type: Type.STRING, description: "If INSERT, the name of the new item" },
      new_amount: { type: Type.STRING, description: "The summed/calculated amount. Must always round UP mathematically if decimals are involved." },
      new_unit: { type: Type.STRING, description: "The unified unit of measurement" }
    },
    required: ["action", "new_amount", "new_unit"]
  }
};

/**
 * Merge an array of new items with an existing grocery list.
 */
export async function mergeGroceryList(
  existingItems: { id: string; name: string; amount: string; unit: string }[],
  newItems: { name: string; amount: string; unit: string }[]
): Promise<{ action: "UPDATE" | "INSERT"; target_id?: string; name?: string; new_amount: string; new_unit: string }[] | null> {
  const ai = getAI();
  const prompt = `You are a strict grocery list compiler.
I will give you an EXISTING grocery list, and a list of NEW items to add.
Your job is to match new items to existing items if they are the exact same or very similar ingredient (e.g. "minced beef" and "ground beef").

Rules:
1. If a new item matches an existing item, output "UPDATE", provide the existing item's \`target_id\`, and calculate the \`new_amount\` by mathematically summing the new amount with the existing amount. Use the existing item's unit as the baseline \`new_unit\`. 
2. ALWAYS round mathematically UP! E.g. "500g" + "2 lbs" ≈ "1900g" or "1.1 lbs" + "2 lbs" = "3.1 lbs". Do not round to whole numbers unless it makes logical sense. If conversion is impossible, try mapping it logically or default to a reasonable ceiling.
3. If a new item does NOT match anything in the existing list, output "INSERT", provide the item's \`name\`, \`new_amount\`, and \`new_unit\`.

EXISTING GROCERY LIST:
${JSON.stringify(existingItems, null, 2)}

NEW ITEMS TO ADD:
${JSON.stringify(newItems, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: GROCERY_MERGE_SCHEMA,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.error("Grocery list merge failed:", err);
    throw err;
  }
}
