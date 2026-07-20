"use client";

import { motion } from "framer-motion";
import type { LifeArea } from "@/types";

interface LifeCompassProps {
  areas: LifeArea[];
}

const RADII = [88, 72, 56, 40, 24];
const STROKE = 12;

export function LifeCompass({ areas }: LifeCompassProps) {
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center">
      <svg width={200} height={200} viewBox="0 0 200 200" className="shrink-0 -rotate-90">
        {areas.map((area, i) => {
          const r = RADII[i] ?? 24;
          const circumference = 2 * Math.PI * r;
          const offset = circumference * (1 - area.score / 100);
          return (
            <g key={area.key}>
              <circle
                cx={100}
                cy={100}
                r={r}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={STROKE}
                fill="none"
              />
              <motion.circle
                cx={100}
                cy={100}
                r={r}
                stroke={`var(${area.colorVar})`}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1, delay: 0.15 * i, ease: "easeOut" }}
              />
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-col gap-2">
        {areas.map((area) => (
          <li key={area.key} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `var(${area.colorVar})` }}
            />
            <span className="w-16 text-foreground/80">{area.label}</span>
            <span className="text-muted">{area.score}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
