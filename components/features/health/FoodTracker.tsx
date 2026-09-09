"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Sparkles, Type, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";
import type { MealType } from "@/types";

interface Analysis {
  description: string;
  meal_type: MealType;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  confidence: "high" | "medium" | "low";
  note: string;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "בוקר" },
  { value: "lunch", label: "צהריים" },
  { value: "dinner", label: "ערב" },
  { value: "snack", label: "חטיף" },
  { value: "post-workout", label: "אחרי אימון" },
];

const CONFIDENCE_LABEL = { high: "ביטחון גבוה", medium: "אומדן", low: "אומדן גס" } as const;

// Vision / text food tracker: snap a plate or type "2 eggs and toast", the AI
// estimates calories + macros, you correct anything, then log it. The result
// is always editable before saving — it's an estimate.
export function FoodTracker() {
  const addMeal = useAtlasStore((s) => s.addMeal);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"photo" | "text">("photo");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function reset() {
    setResult(null);
    setPreview(null);
    setText("");
    setError(null);
    setSaved(false);
  }

  async function analyzeImage(file: File) {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/food-analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "ניתוח התמונה נכשל.");
        return;
      }
      setResult(data as Analysis);
    } catch {
      setError("אין חיבור לשרת.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeText() {
    const t = text.trim();
    if (!t || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/food-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "ניתוח הטקסט נכשל.");
        return;
      }
      setResult(data as Analysis);
    } catch {
      setError("אין חיבור לשרת.");
    } finally {
      setAnalyzing(false);
    }
  }

  function patch(p: Partial<Analysis>) {
    setResult((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function save() {
    if (!result || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addMeal({
        description: result.description.trim() || "ארוחה",
        type: result.meal_type,
        calories: Math.round(result.calories),
        protein: Math.round(result.protein_g),
        carbs: Math.round(result.carbs_g),
        fats: Math.round(result.fats_g),
      });
      setSaved(true);
      setTimeout(reset, 1200);
    } catch {
      setError("שמירת הארוחה נכשלה.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Camera size={15} className="text-accent-fitness" aria-hidden />
          מעקב מזון חכם
        </p>
        <div className="flex gap-1 rounded-lg bg-fill-subtle p-0.5">
          <button
            onClick={() => setMode("photo")}
            className={cn(
              "focus-ring flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
              mode === "photo" ? "bg-surface text-foreground shadow-sm" : "text-muted"
            )}
          >
            <Camera size={12} aria-hidden />
            תמונה
          </button>
          <button
            onClick={() => setMode("text")}
            className={cn(
              "focus-ring flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
              mode === "text" ? "bg-surface text-foreground shadow-sm" : "text-muted"
            )}
          >
            <Type size={12} aria-hidden />
            טקסט
          </button>
        </div>
      </div>

      {!result && (
        <>
          {mode === "photo" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) analyzeImage(f);
                }}
              />
              {preview && analyzing ? (
                <div className="relative overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="max-h-48 w-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-foreground">
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    מנתח את הצלחת…
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={analyzing}
                  className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-glass-border py-8 text-muted transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <Camera size={22} aria-hidden />
                  <span className="text-sm">צלם או בחר תמונה של האוכל</span>
                </button>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyzeText()}
                placeholder="למשל: 2 ביצים, פרוסת לחם וטחינה"
                className="focus-ring flex-1 rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
              />
              <button
                onClick={analyzeText}
                disabled={!text.trim() || analyzing}
                className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-fitness/20 px-4 py-2.5 text-sm font-medium text-accent-fitness transition-opacity disabled:opacity-40"
              >
                {analyzing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-accent-family">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <input
              value={result.description}
              onChange={(e) => patch({ description: e.target.value })}
              className="focus-ring min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground"
              aria-label="תיאור הארוחה"
            />
            <button
              onClick={reset}
              aria-label="בטל"
              className="focus-ring shrink-0 rounded-md p-1 text-muted hover:text-foreground"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {MEAL_TYPES.map((mt) => (
              <button
                key={mt.value}
                onClick={() => patch({ meal_type: mt.value })}
                className={cn(
                  "focus-ring rounded-lg border px-2 py-0.5 text-[0.7rem] transition-colors",
                  result.meal_type === mt.value
                    ? "border-gold-line bg-gold-soft text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {mt.label}
              </button>
            ))}
            <span className="ms-auto text-[0.65rem] text-muted">{CONFIDENCE_LABEL[result.confidence]}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {([
              ["calories", "קלוריות"],
              ["protein_g", "חלבון"],
              ["carbs_g", "פחמימות"],
              ["fats_g", "שומן"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[0.65rem] text-muted">{label}</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(result[key])}
                  onChange={(e) => patch({ [key]: Math.max(0, Number(e.target.value)) } as Partial<Analysis>)}
                  className="focus-ring ltr w-full rounded-lg bg-surface px-2 py-1.5 text-center text-sm tabular-nums text-foreground"
                />
              </label>
            ))}
          </div>

          {result.note && <p className="text-[0.7rem] italic text-muted">{result.note}</p>}

          <button
            onClick={save}
            disabled={saving || saved}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-lg bg-accent-fitness/20 px-4 py-2 text-sm font-medium text-accent-fitness transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saved ? (
              <>
                <Check size={14} aria-hidden />
                נרשם
              </>
            ) : saving ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                שומר…
              </>
            ) : (
              "רשום את הארוחה"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
