"use client";

import { useEffect, useState } from "react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";
import type { MomentCategory } from "@/types";
import { cn } from "@/lib/utils";

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MomentCategory>("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const addMoment = useAtlasStore((s) => s.addMoment);
  const { loading: saving, error: saveError, run: save } = useApiCall(addMoment);

  // Ctrl/Cmd+K is a trigger, not a dismiss — stays separate from Modal's
  // built-in Escape-to-close handling.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSave() {
    if (!content.trim()) return;
    save({
      category,
      title: title.trim() || "רגע חדש",
      content: content.trim(),
    })
      .then(() => {
        setTitle("");
        setContent("");
        setCategory("general");
        setOpen(false);
      })
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} zIndex={Z_INDEX.modal} panelClassName="max-w-lg p-5">
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
        aria-label="כותרת הרגע"
        className="mb-2 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="מה עובר עליך עכשיו?"
        aria-label="תוכן הרגע"
        rows={4}
        autoFocus
        className="mb-4 w-full resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
      />

      {saveError && <p className="mb-2 text-xs text-accent-family">{saveError}</p>}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Esc לביטול · ⌘K לפתיחה/סגירה</span>
        <button
          onClick={handleSave}
          disabled={!content.trim() || saving}
          className="rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
        >
          {saving ? "שומר…" : "שמור רגע"}
        </button>
      </div>
    </Modal>
  );
}
