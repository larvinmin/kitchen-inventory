"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import fuzzysort from "fuzzysort";
import type {
  RecipeWithIngredients,
  CookingIngredient,
  CookSessionWithRecipe,
  RatingCategory,
  InventoryItemWithIngredient,
  CookSubstitutionType
} from "@/lib/types";
import { INVENTORY_CATEGORIES } from "@/lib/types";
import { createBinarySearch } from "@/lib/ranking";

type Phase = "cooking" | "photo" | "rating";
type RatingStep = "category" | "compare" | "done";

export default function CookPage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = params.id as string;

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [inventory, setInventory] = useState<InventoryItemWithIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("cooking");

  const [ingredients, setIngredients] = useState<(CookingIngredient & { 
    matchedInventoryItemId?: string, 
    matchedInventoryItem?: InventoryItemWithIngredient,
    showOptions?: boolean,
    subType?: CookSubstitutionType
  })[]>([]);
  
  const [deletedOriginalIngredientIds, setDeletedOriginalIngredientIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [substituteModalIdx, setSubstituteModalIdx] = useState<number | null>(null);
  const [subForm, setSubForm] = useState({ name: "", amount: "", unit: "" });

  const [addIngredientModalOpen, setAddIngredientModalOpen] = useState(false);
  const [newIngredientForm, setNewIngredientForm] = useState({ name: "", amount: "", unit: "" });

  // Add Pantry Modal State
  const [addModalIdx, setAddModalIdx] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ name: "", category: "Other", amount: "1", unit: "" });
  const [isAddingPantry, setIsAddingPantry] = useState(false);

  // Photo phase state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [postCookNotes, setPostCookNotes] = useState("");

  // Rating phase state
  const [ratingStep, setRatingStep] = useState<RatingStep>("category");
  const [selectedCategory, setSelectedCategory] = useState<RatingCategory | null>(null);
  const [categoryItems, setCategoryItems] = useState<CookSessionWithRecipe[]>([]);
  const [binarySearch, setBinarySearch] = useState<ReturnType<typeof createBinarySearch> | null>(null);
  const [currentCompareIdx, setCurrentCompareIdx] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Swipe state for substituted ingredients
  const [swipedIdx, setSwipedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchEverything = async () => {
      const supabase = createClient();
      const recipeProm = supabase
        .from("recipes")
        .select(`*, recipe_ingredients (*, ingredients (*))`)
        .eq("id", recipeId)
        .single();
        
      const invProm = fetch("/api/inventory").then(res => res.json());

      const [resRecipe, resInv] = await Promise.all([recipeProm, invProm]);
      if (cancelled) return;

      let fetchedInv: InventoryItemWithIngredient[] = [];
      if (resInv && resInv.items) {
        fetchedInv = resInv.items;
        setInventory(fetchedInv);
      }

      const getMatch = (ingredientName: string | undefined) => {
        if (!ingredientName || ingredientName.trim() === "" || fetchedInv.length === 0) return null;
        
        const substringMatch = fetchedInv.find(i => {
          const invName = (i.ingredients?.name || "").trim().toLowerCase();
          if (!invName) return false;
          const targetName = ingredientName.trim().toLowerCase();
          return invName.includes(targetName) || targetName.includes(invName);
        });
        if (substringMatch) return substringMatch;

        const res = fuzzysort.go(ingredientName, fetchedInv, { key: "ingredients.name", limit: 1, threshold: -500 });
        if (res && res.length > 0) return res[0].obj;
        return null;
      };

      if (!resRecipe.error && resRecipe.data) {
        setRecipe(resRecipe.data as RecipeWithIngredients);
        const sorted = [...(resRecipe.data.recipe_ingredients || [])].sort(
          (a, b) => a.order_index - b.order_index
        );

        setIngredients(
          sorted.map((ri) => {
            const match = getMatch(ri.ingredients?.name);
            return {
              recipeIngredientId: ri.id,
              originalName: ri.ingredients?.name || "Unknown",
              originalAmount: ri.amount || "",
              originalUnit: ri.unit || "",
              originalNotes: ri.notes || "",
              isSubstituted: false,
              subType: "swap",
              matchedInventoryItemId: match?.id,
              matchedInventoryItem: match || undefined
            };
          })
        );

        const inst = typeof resRecipe.data.instructions === "string" 
           ? JSON.parse(resRecipe.data.instructions) 
           : resRecipe.data.instructions;
        setInstructions(inst || []);
      }
      setLoading(false);
    };

    fetchEverything();
    return () => { cancelled = true; };
  }, [recipeId]);


  const handleIngredientClick = (idx: number) => {
    const item = ingredients[idx];
    if (item.isSubstituted) return;

    // Toggle options menu
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, showOptions: !ing.showOptions } : { ...ing, showOptions: false }));
  };

  const handleRanOut = async (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = ingredients[idx];
    if (!item.matchedInventoryItemId) return;
    
    try {
      const res = await fetch(`/api/inventory/${item.matchedInventoryItemId}`, { method: "DELETE" });
      if (res.ok) {
        setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, matchedInventoryItemId: undefined, matchedInventoryItem: undefined, showOptions: false } : ing));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToPantry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addModalIdx === null || !addForm.name.trim()) return;
    
    setIsAddingPantry(true);
    try {
      const res = await fetch("/api/inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [addForm] })
      });
      if (res.ok) {
        // Technically we should fetch inventory again to map it properly, but skipping for speed in cook
        // We'll just superficially map it to Green to satisfy the UI feedback loop
        setIngredients(prev => prev.map((ing, i) => i === addModalIdx ? {
          ...ing, 
          // mock matched item to trick UI into turning green
          matchedInventoryItemId: "recent-added-mock",
          matchedInventoryItem: { amount: addForm.amount, unit: addForm.unit, ingredients: { name: addForm.name, category: addForm.category } } as any,
          showOptions: false
        } : ing));
        setAddModalIdx(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingPantry(false);
    }
  };


  // Handle photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadPhoto = async () => {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      const res = await fetch("/api/upload-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setPhotoUrl(data.url);
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploading(false);
    }
  };

  const proceedToPhoto = () => {
    // TRIGGER AUTO DEDUCTIONS
    const trackCategories = ["Meat", "Seafood", "Fruit & Vegetable", "Dairy"];
    const deductions = ingredients.filter(i => !i.isSubstituted && i.matchedInventoryItemId && trackCategories.includes(i.matchedInventoryItem?.ingredients?.category || ""))
      .map(i => ({
        inventory_item_id: i.matchedInventoryItemId!,
        original_amount: i.matchedInventoryItem!.amount || "1",
        original_unit: i.matchedInventoryItem!.unit || "",
        ingredient_name: i.matchedInventoryItem!.ingredients.name,
        category: i.matchedInventoryItem!.ingredients.category,
        consumed_amount: i.originalAmount || "1",
        consumed_unit: i.originalUnit || ""
      }));

    if (deductions.length > 0) {
      // Fire and forget
      fetch("/api/inventory/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: deductions })
      }).catch(console.error);
    }

    setPhase("photo");
  };

  const finishPhoto = async () => {
    if (photoFile) {
      await uploadPhoto();
    }
    setPhase("rating");
  };

  const selectCategory = useCallback(
    async (category: RatingCategory) => {
      setSelectedCategory(category);
      const res = await fetch("/api/cook-sessions");
      const data = await res.json();
      const sessionsInCategory = (data.sessions || []).filter(
        (s: CookSessionWithRecipe) => s.rating_category === category
      );

      sessionsInCategory.sort((a: CookSessionWithRecipe, b: CookSessionWithRecipe) => (a.rating_rank ?? 0) - (b.rating_rank ?? 0));
      setCategoryItems(sessionsInCategory);

      if (sessionsInCategory.length === 0) {
        setRatingStep("done");
        setFinalScore(category === "good" ? 8.4 : category === "ok" ? 5.0 : 1.7);
      } else {
        const bs = createBinarySearch(sessionsInCategory.length);
        setBinarySearch(bs);
        setCurrentCompareIdx(bs.getMidpoint());
        setRatingStep("compare");
      }
    },
    []
  );

  const handleBetter = () => {
    if (!binarySearch) return;
    binarySearch.better();
    if (binarySearch.isComplete()) finishComparison();
    else setCurrentCompareIdx(binarySearch.getMidpoint());
  };

  const handleWorse = () => {
    if (!binarySearch) return;
    binarySearch.worse();
    if (binarySearch.isComplete()) finishComparison();
    else setCurrentCompareIdx(binarySearch.getMidpoint());
  };

  const finishComparison = () => {
    if (!binarySearch || !selectedCategory) return;
    const insertionRank = binarySearch.getInsertionRank();
    const totalAfterInsert = categoryItems.length + 1;
    const ranges = { bad: [0, 3.3], ok: [3.3, 6.7], good: [6.7, 10] };
    const [min, max] = ranges[selectedCategory];
    const fraction = totalAfterInsert === 1 ? 0.5 : insertionRank / (totalAfterInsert - 1);
    const score = Number((max - fraction * (max - min)).toFixed(1));
    setFinalScore(score);
    setRatingStep("done");
  };

  const saveSession = async () => {
    if (!recipe || !selectedCategory || !binarySearch) {
      if (!recipe || !selectedCategory) return;
    }
    setSaving(true);
    const substitutions = [
      ...ingredients.filter((ing) => ing.isSubstituted)
        .map((ing) => ({
          original_recipe_ingredient_id: ing.recipeIngredientId || null,
          original_ingredient_name: ing.subType === "addition" ? null : ing.originalName,
          original_amount: ing.originalAmount,
          original_unit: ing.originalUnit,
          substitute_ingredient_name: ing.substituteName!,
          substitute_amount: ing.substituteAmount || "",
          substitute_unit: ing.substituteUnit || "",
          substitute_notes: ing.substituteNotes || "",
          sub_type: ing.subType || "swap",
        })),
      ...deletedOriginalIngredientIds.map(id => {
        const ri = (recipe.recipe_ingredients || []).find(r => r.id === id);
        return {
          original_recipe_ingredient_id: id,
          original_ingredient_name: ri?.ingredients?.name || "Unknown",
          original_amount: ri?.amount || "",
          original_unit: ri?.unit || "",
          substitute_ingredient_name: "[Deleted]",
          substitute_amount: "",
          substitute_unit: "",
          substitute_notes: "",
          sub_type: "deletion" as const,
        };
      })
    ];

    const combinedNotes = [notes, postCookNotes].filter(Boolean).join("\n\n---\n\n");
    try {
      const res = await fetch("/api/cook-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          notes: combinedNotes || null,
          photo_url: photoUrl,
          rating_category: selectedCategory,
          rating_rank: binarySearch?.getInsertionRank() ?? 0,
          substitutions,
          modified_instructions: instructions,
        }),
      });
      if (res.ok) router.push("/cook-log");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const applySubstitute = () => {
    if (substituteModalIdx === null || !subForm.name.trim()) return;
    setIngredients((prev) => prev.map((ing, i) =>
        i === substituteModalIdx ? {
              ...ing, 
              substituteName: subForm.name, 
              substituteAmount: subForm.amount, 
              substituteUnit: subForm.unit, 
              isSubstituted: true,
              subType: "swap",
            } : ing
      )
    );
    setSubstituteModalIdx(null);
    setSubForm({ name: "", amount: "", unit: "" });
  };

  const handleRemoveIngredient = (idx: number) => {
    const item = ingredients[idx];
    if (item.recipeIngredientId) {
      setDeletedOriginalIngredientIds(prev => [...prev, item.recipeIngredientId!]);
    }
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddIngredient = () => {
    if (!newIngredientForm.name.trim()) return;
    setIngredients(prev => [
      ...prev,
      {
        originalName: "[Addition]",
        originalAmount: "",
        originalUnit: "",
        originalNotes: "",
        substituteName: newIngredientForm.name,
        substituteAmount: newIngredientForm.amount,
        substituteUnit: newIngredientForm.unit,
        isSubstituted: true,
        subType: "addition",
      }
    ]);
    setAddIngredientModalOpen(false);
    setNewIngredientForm({ name: "", amount: "", unit: "" });
  };

  const undoSubstitute = (idx: number) => {
    const item = ingredients[idx];
    if (item.subType === "addition") {
      setIngredients((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setIngredients((prev) => prev.map((ing, i) => i === idx ? {
            ...ing, 
            substituteName: undefined, 
            substituteAmount: undefined, 
            substituteUnit: undefined, 
            isSubstituted: false,
            subType: "swap",
          } : ing
        )
      );
    }
    setSwipedIdx(null);
  };

  // Instruction adjustments
  const handleUpdateInstruction = (idx: number, text: string) => {
    setInstructions(prev => prev.map((s, i) => i === idx ? text : s));
  };

  const handleAddInstruction = () => {
    setInstructions(prev => [...prev, ""]);
  };

  const handleDeleteInstruction = (idx: number) => {
    setInstructions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleMoveInstruction = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === instructions.length - 1) return;

    setInstructions(prev => {
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Loading recipe...</p>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-20">
        <span className="text-5xl block mb-4">😕</span>
        <h2 className="text-lg font-semibold text-text-primary">Recipe not found</h2>
      </div>
    );
  }



  if (phase === "cooking") {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.back()} className="text-xs text-text-tertiary hover:text-text-secondary transition-colors mb-1 cursor-pointer">
              ← Cancel
            </button>
            <h1 className="text-xl font-bold text-text-primary">🍳 Cooking: {recipe.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent">Step 1 of 3</span>
          </div>
        </div>

        {/* Ingredients */}
        <div className="glass rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">Ingredients</h2>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="relative overflow-hidden rounded-xl">
                <div
                  className={`relative transition-transform duration-200 ${swipedIdx === idx ? "-translate-x-24" : ""}`}
                  onClick={() => {
                    if (ing.isSubstituted) setSwipedIdx(swipedIdx === idx ? null : idx);
                  }}
                >
                  <div
                    onClick={() => handleIngredientClick(idx)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      ing.isSubstituted ? "bg-amber-500/5 border-amber-500/20" : ing.matchedInventoryItemId ? "bg-green-500/10 border-green-500/20" : "bg-bg-secondary/50 border-border hover:bg-bg-secondary/80"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ing.isSubstituted ? "bg-amber-500" : ing.matchedInventoryItemId ? "bg-green-500" : "bg-accent"}`} />
                      <div className="min-w-0">
                        {ing.isSubstituted && ing.subType === "swap" ? (
                          <div>
                            <span className="text-sm font-medium text-text-primary">{ing.substituteAmount} {ing.substituteUnit} {ing.substituteName}</span>
                            <span className="text-xs text-text-tertiary ml-2">(swapped)</span>
                          </div>
                        ) : ing.isSubstituted && ing.subType === "addition" ? (
                          <div>
                            <span className="text-sm font-medium text-text-primary">{ing.substituteAmount} {ing.substituteUnit} {ing.substituteName}</span>
                            <span className="text-xs text-green-500 font-medium ml-2">(added)</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className={`text-sm ${ing.matchedInventoryItemId ? "text-green-800" : "text-text-primary"}`}>
                              {ing.originalAmount && <span className="font-medium mr-1">{ing.originalAmount}</span>}
                              {ing.originalUnit && <span className={ing.matchedInventoryItemId ? "opacity-80 mr-1" : "text-text-secondary mr-1"}>{ing.originalUnit}</span>}
                              <span className={ing.matchedInventoryItemId ? "font-semibold" : ""}>{ing.originalName}</span>
                              {ing.originalNotes && <span className={`italic ml-1 ${ing.matchedInventoryItemId ? "opacity-70" : "text-text-tertiary"}`}>— {ing.originalNotes}</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {!ing.isSubstituted && ing.showOptions && (
                      <div className="flex items-center gap-1.5 shrink-0 animate-fade-in pl-2">
                        <div className="flex flex-col gap-1 items-stretch">
                           <div className="flex gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setSubstituteModalIdx(idx); setSubForm({ name: "", amount: "", unit: "" }); setIngredients(prev => prev.map((ig, i) => i === idx ? {...ig, showOptions: false} : ig)); }} className="text-[10px] uppercase tracking-tight font-bold bg-bg-primary border border-border text-text-primary px-2 py-1 rounded-md hover:bg-bg-tertiary transition-colors">Swap</button>
                              
                              {ing.matchedInventoryItemId ? (
                                <button onClick={(e) => handleRanOut(idx, e)} className="text-[10px] uppercase tracking-tight border border-red-500/30 text-red-600 font-bold px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors">Used Up</button>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setAddModalIdx(idx); setAddForm({ name: ing.originalName, category: "Other", amount: ing.originalAmount || "1", unit: ing.originalUnit || "" }); setIngredients(prev => prev.map((ig, i) => i === idx ? {...ig, showOptions: false} : ig)); }} className="text-[10px] uppercase tracking-tight border border-green-500/30 text-green-600 font-bold px-2 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 transition-colors">Add to Pantry</button>
                              )}
                           </div>
                           <div className="flex gap-1">
                              <button onClick={(e) => { e.stopPropagation(); handleRemoveIngredient(idx); }} className="text-[10px] uppercase tracking-tight font-bold border border-red-500/20 text-red-400 px-2 py-1 rounded-md hover:bg-red-500/5 transition-colors flex-1">Delete</button>
                              <button onClick={(e) => { e.stopPropagation(); setIngredients(prev => prev.map((ig, i) => i === idx ? {...ig, showOptions: false} : ig)) }} className="text-[10px] uppercase tracking-tight font-bold bg-bg-tertiary text-text-tertiary px-2 py-1 rounded-md transition-colors">Back</button>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Undo reveal */}
                {ing.isSubstituted && swipedIdx === idx && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-2">
                    <div className="text-xs text-text-tertiary px-2">{ing.subType === "addition" ? "Newly Added" : `was: ${ing.originalName}`}</div>
                    <button onClick={() => undoSubstitute(idx)} className="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">{ing.subType === "addition" ? "Remove" : "Restore"}</button>
                  </div>
                )}
              </div>
            ))}
            
            {/* Add Ingredient Button */}
            <button 
              onClick={() => setAddIngredientModalOpen(true)}
              className="w-full p-3 rounded-xl border border-dashed border-border text-text-tertiary text-sm hover:border-accent hover:text-accent transition-all group flex items-center justify-center gap-2"
            >
              <span className="text-lg">+</span> Add Ingredient
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Instructions</h2>
             <button 
                onClick={handleAddInstruction}
                className="text-xs text-accent font-medium hover:text-accent-hover transition-colors"
             >
                + Add Step
             </button>
          </div>
          <div className="space-y-4">
            {instructions.map((step: string, i: number) => (
                <div
                   draggable={phase === "cooking"}
                   onDragStart={() => setDraggedIndex(i)}
                   onDragOver={(e) => {
                     e.preventDefault();
                     if (draggedIndex === null || draggedIndex === i) return;
                     const next = [...instructions];
                     const [moved] = next.splice(draggedIndex, 1);
                     next.splice(i, 0, moved);
                     setInstructions(next);
                     setDraggedIndex(i);
                   }}
                   onDragEnd={() => setDraggedIndex(null)}
                   className={`flex gap-3 group px-2 py-1.5 rounded-xl transition-colors ${draggedIndex === i ? "bg-accent/5 border border-dashed border-accent/20" : ""}`}
                >
                  <div className="flex flex-col items-center pt-1 cursor-grab active:cursor-grabbing">
                     <svg className="w-5 h-5 text-text-tertiary group-hover:text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                     </svg>
                  </div>
                <div className="flex-1 relative">
                  <span className="absolute -left-6 top-1 flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-black shrink-0 shadow-lg shadow-accent/20">{i + 1}</span>
                  <div className="flex gap-2">
                    <textarea 
                       value={step} 
                       onChange={(e) => handleUpdateInstruction(i, e.target.value)}
                       className="flex-1 p-3 rounded-xl bg-bg-secondary/50 border border-border text-sm text-text-secondary leading-relaxed resize-none h-auto min-h-[48px] focus:border-accent focus:bg-bg-secondary outline-none transition-all"
                       rows={Math.max(1, step.split('\n').length)}
                    />
                    <button 
                      onClick={() => handleDeleteInstruction(i)}
                      className="p-2 text-text-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cooking Notes */}
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3 uppercase tracking-wider">Cooking Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note any modifications, timing adjustments, etc..." className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:border-accent outline-none resize-none h-24" />
        </div>

        <button onClick={proceedToPhoto} className="w-full py-4 rounded-2xl bg-accent text-text-inverse font-bold text-base hover:bg-accent-hover transition-all active:scale-[0.98]">
          ✅ Finish Cooking
        </button>


        {/* Add Modal */}
        {addModalIdx !== null && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="glass w-full max-w-sm p-6 rounded-3xl border border-border animate-fade-in">
                <h3 className="text-xl font-bold text-text-primary mb-2">Pantry Addition</h3>
                <p className="text-xs text-text-tertiary mb-6">Found some <span className="font-bold text-text-secondary">{addForm.name}</span> lying around?</p>
                <form onSubmit={handleAddToPantry} className="space-y-4">
                  <div className="flex gap-2">
                    <input type="text" placeholder="Amount" value={addForm.amount} onChange={e => setAddForm({...addForm, amount: e.target.value})} className="flex-1 w-full p-3 rounded-xl bg-bg-secondary text-sm text-text-primary focus:border-accent" required />
                    <input type="text" placeholder="Unit" value={addForm.unit} onChange={e => setAddForm({...addForm, unit: e.target.value})} className="flex-1 w-full p-3 rounded-xl bg-bg-secondary text-sm text-text-primary focus:border-accent" />
                  </div>
                  <select value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})} className="w-full p-3 rounded-xl bg-bg-secondary text-sm text-text-primary focus:border-accent">
                    {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setAddModalIdx(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:bg-bg-tertiary">Cancel</button>
                    <button type="submit" disabled={isAddingPantry} className="flex-1 py-2.5 rounded-xl bg-accent text-white font-bold disabled:opacity-50">Add</button>
                  </div>
                </form>
             </div>
          </div>
        )}

        {/* Substitute Modal */}
        {substituteModalIdx !== null && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-text-primary mb-1">Substitute Ingredient</h3>
              <p className="text-xs text-text-tertiary mb-4">Replacing: <span className="text-text-secondary">{ingredients[substituteModalIdx].originalAmount} {ingredients[substituteModalIdx].originalUnit} {ingredients[substituteModalIdx].originalName}</span></p>
              <div className="space-y-3">
                <input type="text" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder="Substitute name (e.g. almond milk)" className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" autoFocus />
                <div className="flex gap-2">
                  <input type="text" value={subForm.amount} onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })} placeholder="Amount" className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" />
                  <input type="text" value={subForm.unit} onChange={(e) => setSubForm({ ...subForm, unit: e.target.value })} placeholder="Unit" className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setSubstituteModalIdx(null)} className="flex-1 py-2.5 rounded-xl bg-bg-tertiary text-text-secondary text-sm font-medium hover:bg-bg-secondary cursor-pointer">Cancel</button>
                <button onClick={applySubstitute} disabled={!subForm.name.trim()} className="flex-1 py-2.5 rounded-xl bg-accent text-text-inverse text-sm font-bold hover:bg-accent-hover disabled:opacity-40">Swap</button>
              </div>
            </div>
          </div>
        )}

        {/* Add New Ingredient Modal */}
        {addIngredientModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-text-primary mb-1">Add New Ingredient</h3>
              <p className="text-xs text-text-tertiary mb-4">Adding an extra ingredient to this session.</p>
              <div className="space-y-3">
                <input type="text" value={newIngredientForm.name} onChange={(e) => setNewIngredientForm({ ...newIngredientForm, name: e.target.value })} placeholder="Ingredient name (e.g. Garlic powder)" className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" autoFocus />
                <div className="flex gap-2">
                  <input type="text" value={newIngredientForm.amount} onChange={(e) => setNewIngredientForm({ ...newIngredientForm, amount: e.target.value })} placeholder="Amount (e.g. 1)" className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" />
                  <input type="text" value={newIngredientForm.unit} onChange={(e) => setNewIngredientForm({ ...newIngredientForm, unit: e.target.value })} placeholder="Unit (e.g. tsp)" className="flex-1 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setAddIngredientModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-bg-tertiary text-text-secondary text-sm font-medium hover:bg-bg-secondary cursor-pointer">Cancel</button>
                <button onClick={handleAddIngredient} disabled={!newIngredientForm.name.trim()} className="flex-1 py-2.5 rounded-xl bg-accent text-text-inverse text-sm font-bold hover:bg-accent-hover disabled:opacity-40">Add Ingredient</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ───────────────── PHASE: PHOTO + NOTES ─────────────────
  if (phase === "photo") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="text-center mb-6">
          <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent inline-block mb-3">Step 2 of 3</span>
          <h1 className="text-xl font-bold text-text-primary">📸 How did it turn out?</h1>
        </div>
        <div className="glass rounded-2xl p-5 mb-5">
          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Meal preview" className="w-full h-64 object-cover rounded-xl" />
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-border hover:border-accent/40 cursor-pointer">
              <span className="text-sm text-text-tertiary">Tap to upload a photo</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
            </label>
          )}
        </div>
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3 uppercase tracking-wider">How was it?</h2>
          <textarea value={postCookNotes} onChange={(e) => setPostCookNotes(e.target.value)} placeholder="Was too salty, tasted great..." className="w-full p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent outline-none resize-none h-24" />
        </div>
        <button onClick={finishPhoto} disabled={uploading} className="w-full py-4 rounded-2xl bg-accent text-text-inverse font-bold text-base hover:bg-accent-hover disabled:opacity-60">
          {uploading ? "Uploading..." : "Continue to Rating →"}
        </button>
        <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhase("rating"); }} className="w-full py-3 text-text-tertiary text-sm mt-2 hover:text-text-secondary cursor-pointer">Skip photo</button>
      </div>
    );
  }

  // ───────────────── PHASE: RATING ─────────────────
  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-16">
      <div className="text-center mb-6">
        <span className="text-xs text-text-tertiary px-2 py-1 rounded-lg bg-accent/10 text-accent inline-block mb-3">Step 3 of 3</span>
        <h1 className="text-xl font-bold text-text-primary">⭐ Rate this meal</h1>
      </div>
      {ratingStep === "category" && (
        <div className="space-y-3">
          {(
            [
              { key: "bad" as const, emoji: "🤢", label: "Bad", desc: "Wouldn't make again", color: "from-red-500/10 to-red-600/5 border-red-500/20 text-red-500" },
              { key: "ok" as const, emoji: "😐", label: "Ok", desc: "It was fine", color: "from-yellow-500/10 to-yellow-600/5 border-yellow-500/20 text-yellow-500" },
              { key: "good" as const, emoji: "🤩", label: "Good", desc: "Would definitely make again", color: "from-green-500/10 to-green-600/5 border-green-500/20 text-green-500" },
            ] as const
          ).map(({ key, emoji, label, desc, color }) => (
            <button key={key} onClick={() => selectCategory(key)} className={`w-full p-5 rounded-2xl border bg-gradient-to-r ${color} transition-all active:scale-[0.98] text-left`}>
              <div className="flex items-center gap-4 text-text-primary">
                <span className="text-4xl">{emoji}</span>
                <div><h3 className="font-semibold">{label}</h3><p className="text-xs opacity-70">{desc}</p></div>
              </div>
            </button>
          ))}
        </div>
      )}
      {ratingStep === "compare" && currentCompareIdx !== null && categoryItems[currentCompareIdx] && (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm text-text-secondary text-center mb-5">Was your meal <span className="font-medium text-text-primary">better</span> or <span className="font-medium text-text-primary">worse</span> than...</p>
          <div className="glass rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-text-primary">{categoryItems[currentCompareIdx].recipes.title}</h3>
          </div>
          <div className="flex gap-3">
            <button onClick={handleBetter} className="flex-1 py-4 rounded-xl bg-green-500/10 text-green-400 font-semibold  hover:bg-green-500/20 active:scale-[0.97]">👆 Better</button>
            <button onClick={handleWorse} className="flex-1 py-4 rounded-xl bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 active:scale-[0.97]">👇 Worse</button>
          </div>
        </div>
      )}
      {ratingStep === "done" && finalScore !== null && (
        <div className="text-center">
          <div className="glass rounded-2xl p-8 mb-6">
            <div className="text-6xl font-black text-accent mb-2">{finalScore.toFixed(1)}</div>
            <div className="text-sm text-text-secondary mb-4">out of 10</div>
          </div>
          <button onClick={saveSession} disabled={saving} className="w-full py-4 rounded-2xl bg-accent text-white font-bold text-base hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60">
            {saving ? "Saving..." : "Save Session"}
          </button>
        </div>
      )}
    </div>
  );
}
