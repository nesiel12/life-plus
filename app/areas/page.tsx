"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LIFE_AREAS } from "@/lib/lifeAreas";

export default function AreasPage() {
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">תחומי חיים</h1>
      <p className="mb-10 text-sm text-muted">חמשת המרחבים שמרכיבים את האטלס שלך.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {lifeAreas.map((area, i) => {
          const meta = LIFE_AREAS[area.key];
          const Icon = meta.icon;
          return (
            <motion.div
              key={area.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
            >
              <Link href={`/areas/${meta.slug}`}>
                <GlassCard className="h-full transition-transform hover:-translate-y-0.5">
                  <div className="mb-3 flex items-center justify-between">
                    <div
                      className="flex size-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `color-mix(in srgb, var(${area.colorVar}) 20%, transparent)` }}
                    >
                      <Icon size={18} style={{ color: `var(${area.colorVar})` }} />
                    </div>
                    <span className="text-sm text-muted">{area.score}%</span>
                  </div>
                  <p className="font-medium text-foreground">{meta.pageTitle}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${area.score}%`, backgroundColor: `var(${area.colorVar})` }}
                    />
                  </div>
                </GlassCard>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </main>
  );
}
