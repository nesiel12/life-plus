"use client";

import { motion } from "framer-motion";
import { useAtlasStore } from "@/store/useAtlasStore";
import { momentCategoryLabel, momentCategoryColorVar } from "@/lib/lifeAreas";

export default function TimelinePage() {
  const moments = useAtlasStore((s) => s.moments);
  const sorted = [...moments].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">ציר הזמן</h1>
      <p className="mb-10 text-sm text-muted">
        הרגעים שבחרת ללכוד. ⌘K בכל מקום באפליקציה כדי להוסיף רגע חדש.
      </p>

      <ol className="flex flex-col gap-4">
        {sorted.map((moment, i) => (
          <motion.li
            key={moment.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.6), ease: "easeOut" }}
            className="glass-card rounded-2xl p-4"
            style={{ borderInlineStart: `3px solid var(${momentCategoryColorVar(moment.category)})` }}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">{moment.title}</h2>
              <span className="ltr text-xs text-muted">
                {new Date(moment.timestamp).toLocaleDateString("he-IL", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
            <p className="mb-2 text-sm leading-relaxed text-foreground/80">{moment.content}</p>
            <span className="text-xs text-muted">{momentCategoryLabel(moment.category)}</span>
          </motion.li>
        ))}

        {sorted.length === 0 && (
          <p className="text-sm text-muted">אין עדיין רגעים. לחץ ⌘K כדי ללכוד את הראשון.</p>
        )}
      </ol>
    </main>
  );
}
