"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ScannedIngredient } from "@/lib/types";
import { INVENTORY_CATEGORIES } from "@/lib/types";

export default function InventoryScanPage() {
  const router = useRouter();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [items, setItems] = useState<ScannedIngredient[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // When a file is selected
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));

    // Automatically trigger scan
    setScanning(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/inventory/scan", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      } else {
        alert(data.error || "Scan failed");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to scan image");
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateItem = (id: string, field: keyof ScannedIngredient, value: string) => {
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((curr) => curr.filter((item) => item.id !== id));
  };

  const handleManualAdd = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        name: "",
        category: "Other",
        amount: "1",
        unit: "",
        expires_at: new Date().toISOString().split("T")[0],
        box_2d: [0, 0, 0, 0] // Hidden or dummy box
      }
    ]);
  };

  const handleSaveAll = async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only send items with a name
        body: JSON.stringify({ items: items.filter(i => i.name.trim()) }),
      });
      
      if (res.ok) {
        router.push("/inventory");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save inventory");
    } finally {
      setSaving(false);
    }
  };

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in pb-20">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Inventory
      </Link>

      <h1 className="text-3xl font-bold text-text-primary mb-6">Scan Groceries</h1>

      {!imagePreviewUrl ? (
        // Upload State
        <div className="glass rounded-3xl border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 transition-all p-12 text-center relative cursor-pointer group">
          <input
            type="file"
            // Let mobile users easily use their camera
            capture="environment"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="flex flex-col items-center justify-center pointer-events-none">
            <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📸</span>
            <h3 className="text-lg font-bold text-text-primary mb-2">
              Take a photo of your groceries
            </h3>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              We'll automatically detect what items you bought and their quantities using AI.
            </p>
            <button className="mt-6 px-6 py-3 bg-accent text-white font-medium rounded-xl pointer-events-none">
              Open Camera / Select Image
            </button>
          </div>
        </div>
      ) : (
        // Processing & Edit State
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Left: Image & Bounding Boxes */}
          <div className="sticky top-6">
            <div className="relative rounded-2xl overflow-hidden glass border border-border bg-bg-secondary w-full aspect-[3/4] sm:aspect-square lg:aspect-auto lg:h-[70vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Uploaded grocery photo"
                className="w-full h-full object-contain"
              />

              {/* Box Overlays */}
              {!scanning && [...items].sort((a, b) => {
                const areaA = (a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1]);
                const areaB = (b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1]);
                return areaB - areaA;
              }).map((item) => {
                // If the box is 0,0,0,0 (manual add), don't render it
                if (item.box_2d[0] === 0 && item.box_2d[2] === 0) return null;

                const [ymin, xmin, ymax, xmax] = item.box_2d;
                const top = (ymin / 1000) * 100;
                const left = (xmin / 1000) * 100;
                const height = ((ymax - ymin) / 1000) * 100;
                const width = ((xmax - xmin) / 1000) * 100;
                const isActive = activeItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveItemId(item.id)}
                    className={`absolute border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      isActive 
                        ? "border-accent bg-accent/20 z-10 shadow-lg shadow-accent/30 scale-[1.02]" 
                        : "border-white/70 bg-black/20 hover:border-accent hover:bg-accent/10"
                    }`}
                    style={{
                      top: `${top}%`,
                      left: `${left}%`,
                      height: `${height}%`,
                      width: `${width}%`,
                    }}
                  >
                    {/* Small badge for the item name to make it obvious */}
                    {isActive && (
                      <span className="absolute -top-3 -left-1 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                        {item.name}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Scanning Overlay */}
              {scanning && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 border-4 border-accent/30 border-t-accent rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">Analyzing image...</h3>
                  <p className="text-white/70 text-sm">Detecting ingredients, quantities, and mapping coordinates...</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Editable List */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">Detected Items</h2>
              <button 
                onClick={handleManualAdd}
                className="text-sm font-medium text-accent hover:text-accent-hover transition-colors px-3 py-1.5 rounded-lg bg-accent/10"
              >
                + Add Item
              </button>
            </div>

            {scanning ? (
              // Loading Skeleton List
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 bg-bg-tertiary rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 glass rounded-2xl border border-dashed border-border">
                <p className="text-text-secondary">No items detected.</p>
                <button onClick={handleManualAdd} className="text-accent text-sm mt-2 font-medium">Add manually</button>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => setActiveItemId(item.id)}
                    className={`glass p-4 rounded-xl border transition-all ${
                      activeItemId === item.id ? "border-accent shadow-md shadow-accent/5" : "border-border hover:border-border-hover"
                    }`}
                  >
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 space-y-3">
                        {/* Name Input */}
                        <div>
                          <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Ingredient</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateItem(item.id, "name", e.target.value)}
                            className={`w-full bg-bg-primary text-sm font-medium text-text-primary px-3 py-2 rounded-lg border focus:ring-1 focus:ring-accent outline-none transition-colors ${activeItemId === item.id ? "border-accent/50" : "border-border focus:border-accent"}`}
                            placeholder="e.g. Yellow Onion"
                          />
                        </div>
                        
                        {/* Category Dropdown */}
                        <div>
                          <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Category</label>
                          <select
                            value={item.category || "Other"}
                            onChange={(e) => handleUpdateItem(item.id, "category", e.target.value)}
                            className="w-full bg-bg-primary text-sm text-text-secondary px-3 py-2 rounded-lg border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                          >
                            {INVENTORY_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Quantity Row */}
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Amount</label>
                            <input
                              type="text"
                              value={item.amount}
                              onChange={(e) => handleUpdateItem(item.id, "amount", e.target.value)}
                              className="w-full bg-bg-primary text-sm text-text-secondary px-3 py-1.5 rounded-lg border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                              placeholder="e.g. 2, approx 1"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Unit</label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleUpdateItem(item.id, "unit", e.target.value)}
                              className="w-full bg-bg-primary text-sm text-text-secondary px-3 py-1.5 rounded-lg border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                              placeholder="e.g. lbs, whole"
                            />
                          </div>
                        </div>

                        {/* Expiration Date Input */}
                        <div>
                          <label className="text-[10px] uppercase font-bold text-text-tertiary mb-1 block">Expiration Date</label>
                          <input
                            type="date"
                            value={item.expires_at || ""}
                            onChange={(e) => handleUpdateItem(item.id, "expires_at", e.target.value)}
                            className="w-full bg-bg-primary text-sm font-medium text-text-primary px-3 py-2 rounded-lg border focus:ring-1 focus:ring-accent outline-none transition-colors border-border focus:border-accent"
                          />
                        </div>
                      </div>

                      {/* Delete */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                        className="text-text-tertiary hover:text-error hover:bg-error/10 p-2 rounded-lg transition-colors mt-4"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Save Button */}
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full mt-6 py-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 flex justify-center items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "💾 Save to Inventory"
                  )}
                </button>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
