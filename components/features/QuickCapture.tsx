"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtlasStore } from "@/store/useAtlasStore";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import type { MomentCategory } from "@/types";
import { cn } from "@/lib/utils";

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MomentCategory>("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const addMoment = useAtlasStore((s) => s.addMoment);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSave() {
    if (!content.trim()) return;
    addMoment({
      category,
      title: title.trim() || "רגע חדש",
      content: content.trim(),
    });
    setTitle("");
    setContent("");
    setCategory("general");
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-32 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="glass-card w-full max-w-lg rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-sm font-medium text-muted">לכידה מהירה של רגע</p>

            <div className="mb-3 flex flex-wrap gap-2">
              {LIFE_AREA_LIST.map((area) => (
                <button
                  key={area.key}
                  onClick={() => setCategory(area.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    category === area.key
                      ? "border-transparent text-background"
                      : "border-glass-border text-muted hover:text-foreground"
                  )}
                  style={category === area.key ? { backgroundColor: `var(${area.colorVar})` } : undefined}
                >
                  {area.label}
                </button>
              ))}
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת (אופציונלי)"
              className="mb-2 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="מה עובר עליך עכשיו?"
              rows={4}
              autoFocus
              className="mb-4 w-full resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Esc לביטול · ⌘K לפתיחה/סגירה</span>
              <button
                onClick={handleSave}
                disabled={!content.trim()}
                className="rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
              >
                שמור רגע
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
