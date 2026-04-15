"use client";

import { useEffect, useState, useCallback } from "react";
import type { DbGroceryListItem } from "@/lib/types";

// Random UUID generator for temporary keys
const genId = () => Math.random().toString(36).substring(2, 9);

type LocalGroceryItem = {
  id?: string;
  _clientId: string;
  name: string;
  amount: string;
  unit: string;
};

// ─── Sub-component for a single row to handle Debounced saves isolation ───
const GroceryRow = ({
  item,
  onChange,
  onRemove,
}: {
  item: LocalGroceryItem;
  onChange: (clientId: string, field: string, val: string) => void;
  onRemove: (clientId: string, dbId?: string) => void;
}) => {
  const [internalName, setInternalName] = useState(item.name);
  const [internalAmount, setInternalAmount] = useState(item.amount);
  const [internalUnit, setInternalUnit] = useState(item.unit);
  const [dbId, setDbId] = useState<string | undefined>(item.id);
  const [isSaving, setIsSaving] = useState(false);

  // Sync prop updates (e.g. from bulk load)
  useEffect(() => {
    setInternalName(item.name);
    setInternalAmount(item.amount);
    setInternalUnit(item.unit);
    setDbId(item.id);
  }, [item.id, item.name, item.amount, item.unit]);

  // Handle local typing
  const handleChange = (field: "name" | "amount" | "unit", val: string) => {
    onChange(item._clientId, field, val); // update parent
    if (field === "name") setInternalName(val);
    if (field === "amount") setInternalAmount(val);
    if (field === "unit") setInternalUnit(val);
  };

  // Debounced API trigger
  useEffect(() => {
    // Only care if this row isn't fully empty. If it is entirely empty, we do nothing.
    if (!internalName.trim() && !dbId) return;

    // If it *was* real but name was deleted, we trigger DELETE
    if (!internalName.trim() && dbId) {
       const timer = setTimeout(async () => {
         try {
           setIsSaving(true);
           const res = await fetch(`/api/grocery-list/${dbId}`, { method: "DELETE" });
           if (res.ok) {
             onRemove(item._clientId, dbId);
           }
         } finally { setIsSaving(false); }
       }, 500);
       return () => clearTimeout(timer);
    }

    // Save/Update flow
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        if (!dbId) {
          // POST
          const res = await fetch("/api/grocery-list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: internalName, amount: internalAmount, unit: internalUnit })
          });
          const data = await res.json();
          if (data.item) {
            setDbId(data.item.id);
            onChange(item._clientId, "id", data.item.id);
          }
        } else {
          // PATCH
          await fetch(`/api/grocery-list/${dbId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: internalName, amount: internalAmount, unit: internalUnit })
          });
        }
      } catch (err) {
        console.error("Failed to sync row", err);
      } finally {
        setIsSaving(false);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(timer);
  }, [internalName, internalAmount, internalUnit, dbId, item._clientId, onRemove]);

  return (
    <div className="flex gap-2 w-full group relative items-center">
      <input
        type="text"
        placeholder="Item Name"
        value={internalName}
        onChange={(e) => handleChange("name", e.target.value)}
        className="flex-[2] min-w-0 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-text-tertiary"
      />
      <input
        type="text"
        placeholder="Amount"
        value={internalAmount}
        onChange={(e) => handleChange("amount", e.target.value)}
        className="flex-1 min-w-0 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-text-tertiary"
      />
      <input
        type="text"
        placeholder="Unit"
        value={internalUnit}
        onChange={(e) => handleChange("unit", e.target.value)}
        className="flex-1 min-w-0 p-3 rounded-xl bg-bg-secondary border border-border text-text-primary text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-text-tertiary"
      />
      
      {/* Saving Indicator */}
      <div className="absolute -right-6 w-4 flex justify-center opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
        {isSaving ? (
           <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        ) : dbId ? (
           <svg className="w-3.5 h-3.5 text-green-500 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        ) : null}
      </div>
    </div>
  );
};


// ─── Main Page ───
export default function GroceryListPage() {
  const [items, setItems] = useState<LocalGroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);

  // Load from database
  useEffect(() => {
    let cancelled = false;
    const fetchItems = async () => {
      try {
        const res = await fetch("/api/grocery-list");
        const json = await res.json();
        if (cancelled) return;
        
        if (json.items) {
          const loaded: LocalGroceryItem[] = json.items.map((it: DbGroceryListItem) => ({
            id: it.id,
            _clientId: genId(),
            name: it.name,
            amount: it.amount || "",
            unit: it.unit || "",
          }));
          setItems(loaded);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchItems();
    return () => { cancelled = true; };
  }, []);

  // Compute and pad visible rows natively inside an effect so `_clientId` doesn't change
  useEffect(() => {
    const activeItemsCount = items.filter((it) => it.name.trim() !== "").length;
    const targetBoxCount = Math.max(5, activeItemsCount + 1);

    if (items.length < targetBoxCount) {
      setItems((prev) => {
        const newItems = [...prev];
        while (newItems.length < targetBoxCount) {
          newItems.push({
            _clientId: genId(),
            name: "",
            amount: "",
            unit: "",
          });
        }
        return newItems;
      });
    }
  }, [items]);

  // Handle parent state updates so the array doesn't go stale
  const handleItemChange = useCallback((clientId: string, field: string, val: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i._clientId === clientId);
      if (idx === -1) return prev;
      
      const clone = [...prev];
      clone[idx] = { ...clone[idx], [field]: val };
      return clone;
    });
  }, []);

  // Handle parent removal hook
  const handleItemRemove = useCallback((clientId: string) => {
    setItems((prev) => prev.filter(i => i._clientId !== clientId));
  }, []);

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete your entire grocery list?")) return;
    setDeletingAll(true);
    try {
      const res = await fetch("/api/grocery-list/all", { method: "DELETE" });
      if (res.ok) {
        setItems([]);
      }
    } catch (error) {
      console.error("Failed to clear list", error);
    } finally {
      setDeletingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in p-6">
        <div className="h-6 w-32 bg-bg-tertiary rounded animate-pulse mb-8" />
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex gap-2">
              <div className="h-10 flex-[2] bg-bg-tertiary rounded-xl animate-pulse" />
              <div className="h-10 flex-1 bg-bg-tertiary rounded-xl animate-pulse" />
              <div className="h-10 flex-1 bg-bg-tertiary rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-20">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
            <span className="text-xl">🛒</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Grocery List</h1>
            <p className="text-sm text-text-secondary mt-0.5">Auto-saves as you type.</p>
          </div>
        </div>

        <button
          onClick={handleClearAll}
          disabled={deletingAll || items.filter(it => it.name.trim() !== "").length === 0}
          className="text-xs px-3 py-2 rounded-xl font-medium border border-red-500/20 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {deletingAll ? "Clearing..." : "Clear List"}
        </button>
      </div>

      <div className="glass rounded-3xl p-6 md:p-8">
        <div className="flex justify-between items-end mb-4 px-1">
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex-[2]">Ingredient</label>
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex-1 ml-2">Amount</label>
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex-1 ml-2">Unit</label>
        </div>
        <div className="space-y-3 relative pr-2">
           {items.map((item) => (
             <GroceryRow 
               key={item._clientId} 
               item={item} 
               onChange={handleItemChange} 
               onRemove={handleItemRemove} 
             />
           ))}
        </div>
      </div>
    </div>
  );
}
