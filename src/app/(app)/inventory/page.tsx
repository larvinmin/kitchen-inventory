"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type InventoryItemWithIngredient, INVENTORY_CATEGORIES } from "@/lib/types";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItemWithIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<string>("Full Inventory");
  const [sortBy, setSortBy] = useState<"category" | "expiration">("category");
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editCategory, setEditCategory] = useState("");

  // Manual Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "Other",
    amount: "1",
    unit: "",
    expires_at: "",
  });
  const [isAdding, setIsAdding] = useState(false);

  const tabs = ["Full Inventory", ...INVENTORY_CATEGORIES];

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this item?")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(items.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("CRITICAL: Delete ALL of your inventory? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/inventory/all`, { method: "DELETE" });
      if (res.ok) {
        setItems([]);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete all items");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEditing = (item: InventoryItemWithIngredient) => {
    setEditingId(item.id);
    setEditAmount(item.amount || "");
    setEditUnit(item.unit || "");
    setEditExpiresAt(item.expires_at ? item.expires_at.split("T")[0] : "");
    setEditCategory(item.ingredients.category || "Other");
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: editAmount, unit: editUnit, expires_at: editExpiresAt || null, category: editCategory }),
      });
      if (res.ok) {
        setItems(
          items.map((i) =>
            i.id === id ? { ...i, amount: editAmount, unit: editUnit, expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null, ingredients: { ...i.ingredients, category: editCategory } } : i
          )
        );
        setEditingId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    setIsAdding(true);
    try {
      const res = await fetch("/api/inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [newItem] }),
      });

      if (res.ok) {
        // Refetch inventory to pick up the newly joined ingredient mapping
        await fetchInventory();
        setIsAddModalOpen(false);
        setNewItem({ name: "", category: "Other", amount: "1", unit: "", expires_at: "" });
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add item");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to add component.");
    } finally {
      setIsAdding(false);
    }
  };

  const formatExpiration = (dateStr: string | null) => {
    if (!dateStr) return null;
    const expDate = new Date(dateStr);
    const today = new Date();
    // Strip time for clean day diff
    expDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays < 0) return <span className="text-error font-medium">Expired {Math.abs(diffDays)}d ago</span>;
    if (diffDays === 0) return <span className="text-error font-bold">Expires today</span>;
    if (diffDays <= 3) return <span className="text-warning font-medium">Expires in {diffDays}d</span>;
    return <span className="text-green-500">Expires in {diffDays}d</span>;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-10 w-48 bg-bg-tertiary rounded-xl" />
        <div className="flex gap-2 mb-8 overflow-hidden">
          {[1,2,3,4].map(i => <div key={i} className="h-10 w-24 bg-bg-tertiary rounded-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-bg-tertiary rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Pre-calculate groups
  const groupedItems = items.reduce((acc, item) => {
    const cat = item.ingredients.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, InventoryItemWithIngredient[]>);

  // Group sorting for Full View
  let displayedCategories: string[] = [];
  if (activeTab === "Full Inventory") {
    displayedCategories = INVENTORY_CATEGORIES.filter(cat => groupedItems[cat]?.length > 0);
    if (groupedItems["Other"]?.length > 0 && !displayedCategories.includes("Other")) {
      displayedCategories.push("Other");
    }
    const rogueKeys = Object.keys(groupedItems).filter(k => !INVENTORY_CATEGORIES.includes(k as any) && k !== "Other");
    displayedCategories.push(...rogueKeys);
  } else {
    displayedCategories = groupedItems[activeTab]?.length > 0 ? [activeTab] : [];
  }

  // Pre-calculate expiration array
  const sortedByExpiration = [...items].sort((a, b) => {
    if (!a.expires_at) return 1;
    if (!b.expires_at) return -1;
    return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
  });

  const isExpirationSort = activeTab === "Full Inventory" && sortBy === "expiration";

  const renderItemCard = (item: InventoryItemWithIngredient) => (
    <div
      key={item.id}
      className="glass p-4 rounded-2xl border border-border flex flex-col group relative overflow-hidden focus-within:border-accent/50"
    >
      <div className="flex-1">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-text-primary text-lg capitalize">
            {item.ingredients.name}
          </h3>
          {!editingId || editingId !== item.id ? (
            <div className="text-xs text-right leading-tight">
              {formatExpiration(item.expires_at)}
            </div>
          ) : null}
        </div>
        
        {editingId === item.id ? (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 min-w-0 bg-bg-primary text-sm text-text-primary px-3 py-1.5 rounded-lg border border-border focus:border-accent outline-none"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="Amount"
              />
              <input
                type="text"
                className="flex-[2] min-w-0 bg-bg-primary text-sm text-text-primary px-3 py-1.5 rounded-lg border border-border focus:border-accent outline-none"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                placeholder="Unit"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col">
                <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1">Expires</label>
                <input
                  type="date"
                  className="w-full bg-bg-primary text-sm text-text-primary px-3 py-1.5 rounded-lg border border-border focus:border-accent outline-none transition-colors"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1">Category</label>
                <select
                  className="w-full bg-bg-primary text-sm text-text-primary px-3 py-1.5 rounded-lg border border-border focus:border-accent outline-none"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-sm flex items-center gap-2 mt-1">
            <span className="bg-bg-tertiary px-2 py-0.5 rounded text-xs font-medium border border-border">
              {item.amount || "—"} {item.unit || ""}
            </span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50 justify-end">
        {editingId === item.id ? (
          <>
            <button
              onClick={() => setEditingId(null)}
              className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={() => saveEdit(item.id)}
              className="text-xs font-medium bg-accent/10 text-accent px-3 py-1.5 rounded-lg hover:bg-accent/20 transition-colors"
            >
              Save
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => startEditing(item)}
              className="text-text-tertiary hover:text-accent transition-colors p-1"
              title="Edit item"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-text-tertiary hover:text-error transition-colors p-1"
              title="Delete item"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-fade-in relative min-h-[calc(100vh-4rem)]">
      
      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-bg-primary/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md p-6 rounded-3xl border border-border animate-fade-in shadow-2xl">
            <h2 className="text-xl font-bold text-text-primary mb-6">Add Inventory Item</h2>
            <form onSubmit={handleManualAdd} className="space-y-4">
              
              <div>
                <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Yellow Onions"
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  className="w-full bg-bg-secondary text-sm font-medium text-text-primary px-4 py-3 rounded-xl border border-border focus:border-accent outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Category</label>
                <select
                  value={newItem.category}
                  onChange={e => setNewItem({...newItem, category: e.target.value})}
                  className="w-full bg-bg-secondary text-sm text-text-primary px-4 py-3 rounded-xl border border-border focus:border-accent outline-none"
                >
                  {INVENTORY_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Amount</label>
                  <input
                    type="text"
                    placeholder="e.g. 2"
                    value={newItem.amount}
                    onChange={e => setNewItem({...newItem, amount: e.target.value})}
                    className="w-full bg-bg-secondary text-sm text-text-primary px-4 py-3 rounded-xl border border-border focus:border-accent outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Unit</label>
                  <input
                    type="text"
                    placeholder="e.g. lbs"
                    value={newItem.unit}
                    onChange={e => setNewItem({...newItem, unit: e.target.value})}
                    className="w-full bg-bg-secondary text-sm text-text-primary px-4 py-3 rounded-xl border border-border focus:border-accent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Expiration Date (Optional)</label>
                <input
                  type="date"
                  value={newItem.expires_at}
                  onChange={e => setNewItem({...newItem, expires_at: e.target.value})}
                  className="w-full bg-bg-secondary text-sm text-text-primary px-4 py-3 rounded-xl border border-border focus:border-accent outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isAdding ? "Saving..." : "Save Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Inventory</h1>
          {items.length > 0 && activeTab === "Full Inventory" && (
            <div className="mt-4 flex gap-4 text-sm bg-bg-tertiary p-1 rounded-xl w-fit border border-border">
              <button 
                onClick={() => setSortBy("category")}
                className={`px-3 py-1.5 rounded-lg transition-colors \${sortBy === "category" ? "bg-bg-secondary text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                Grouped
              </button>
              <button 
                onClick={() => setSortBy("expiration")}
                className={`px-3 py-1.5 rounded-lg transition-colors \${sortBy === "expiration" ? "bg-bg-secondary text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                Expiring First
              </button>
            </div>
          )}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="text-xs font-bold text-accent bg-accent/10 hover:bg-accent/20 px-4 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1"
          >
            <span className="text-sm">+</span> ADD ITEM
          </button>

          {items.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="text-xs font-bold text-error bg-error/10 hover:bg-error/20 px-4 py-2 rounded-xl transition-colors shrink-0 hidden sm:block"
            >
              DELETE ALL
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Tabs */}
      <div className="flex overflow-x-auto pb-4 mb-4 gap-2 scrollbar-none items-center w-full">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab !== "Full Inventory") setSortBy("category");
            }}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-accent text-white shadow-md shadow-accent/20"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover border border-border"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-6xl block mb-6">🥑</span>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            Your inventory is empty
          </h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-8">
            Snap a photo of your fridge or grocery haul to magically add ingredients.
          </p>
        </div>
      ) : activeTab !== "Full Inventory" && displayedCategories.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl border border-dashed border-border">
          <h2 className="text-lg font-bold text-text-primary mb-2">
            No items in {activeTab}
          </h2>
          <p className="text-sm text-text-secondary">
            Switch tabs or scan some groceries.
          </p>
        </div>
      ) : isExpirationSort ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {sortedByExpiration.map(renderItemCard)}
        </div>
      ) : (
        <div className="space-y-12">
          {displayedCategories.map(cat => (
            <div key={cat}>
              {activeTab === "Full Inventory" && (
                <div className="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-md py-3 mb-4 border-b border-border shadow-[0_4px_12px_-8px_rgba(0,0,0,0.1)]">
                  <h2 className="text-xl font-bold text-text-primary">{cat}</h2>
                  <span className="text-xs text-text-tertiary ml-2 font-normal">
                    {groupedItems[cat].length} item{groupedItems[cat].length !== 1 && 's'}
                  </span>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {groupedItems[cat].map(renderItemCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Scan Button */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 md:ml-32 z-20">
        <Link
          href="/inventory/scan"
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-4 rounded-full font-bold shadow-xl shadow-accent/30 transition-all hover:scale-105 active:scale-95 border border-white/10"
        >
          <span className="text-xl">📸</span>
          Scan Groceries
        </Link>
      </div>
    </div>
  );
}
