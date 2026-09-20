"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BatteryCharging, Moon, Sun, Zap } from "lucide-react";
import { energyAdvice, energyAt, energyCurve, energyWindows, hourLabel } from "@/lib/health/energyCurve";
import type { ChronotypeSettings, Meal, Workout } from "@/types";

const W = 720;
const H = 190;
const PAD_X = 18;
const TOP = 26;
const BOTTOM = 150;
/** The chart starts at 04:00 — the quietest hour — so the waking day sits in the middle. */
const START_HOUR = 4;

/**
 * Energy as a color: calm indigo when low, teal through the middle, warm amber
 * at the peaks. Explicit colors rather than theme tokens, because the heatmap
 * is a scale and must read the same in light and dark.
 */
function energyColor(e: number): string {
  const stops = [
    [99, 102, 241], // indigo — rest
    [20, 184, 166], // teal — steady
    [245, 158, 11], // amber — peak
  ];
  const t = Math.min(1, Math.max(0, (e - 0.1) / 0.85)) * 2;
  const [a, b] = t <= 1 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const f = t <= 1 ? t : t - 1;
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

/** Smooth path through points (Catmull–Rom → cubic Bézier). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

interface EnergyWindowGaugeProps {
  chronotype?: ChronotypeSettings;
  meals: Meal[];
  workouts: Workout[];
}

/**
 * חלון האנרגיה — the day's energy as a glowing heatmap curve.
 *
 * A model, labelled as one: shaped by the person's own wake/sleep times and the
 * day-parts they said they peak and dip in, then nudged by today's workouts
 * and meals (lib/health/energyCurve.ts). Peak windows glow amber to be guarded
 * for deep work; rest windows sit in indigo; sleep is dimmed.
 */
export function EnergyWindowGauge({ chronotype, meals, workouts }: EnergyWindowGaugeProps) {
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const [now, setNow] = useState(() => new Date());

  // The "now" marker walks along the day.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const curve = useMemo(() => energyCurve({ chronotype, meals, workouts }), [chronotype, meals, workouts]);
  const windows = useMemo(() => energyWindows(curve), [curve]);
  const level = energyAt(curve, now);

  // Hours in chart order, starting at START_HOUR.
  const ordered = useMemo(() => Array.from({ length: 24 }, (_, i) => curve[(START_HOUR + i) % 24]), [curve]);
  const xFor = (slot: number) => PAD_X + (slot / 24) * (W - PAD_X * 2);
  const yFor = (energy: number) => BOTTOM - energy * (BOTTOM - TOP);
  const slotOf = (hour: number) => (hour - START_HOUR + 24) % 24;

  const points = ordered.map((p, i) => ({ x: xFor(i + 0.5), y: yFor(p.energy) }));
  const line = smoothPath(points);
  const area = `${line} L${points[points.length - 1].x} ${BOTTOM} L${points[0].x} ${BOTTOM} Z`;

  const nowSlot = slotOf(now.getHours() + now.getMinutes() / 60);
  const nowX = xFor(nowSlot);
  const nowY = yFor(level);

  return (
    <section className="glass-card flex flex-col gap-4 rounded-3xl p-5" aria-labelledby={`energy-${uid}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`energy-${uid}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Zap size={17} className="text-gold-ink" aria-hidden />
            חלון האנרגיה
          </h2>
          <p className="text-xs text-muted">הערכה לפי הקצב האישי שלך ולפי מה שנרשם היום</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="ltr text-2xl font-semibold tabular-nums" style={{ color: energyColor(level) }}>
              {Math.round(level * 100)}%
            </p>
            <p className="text-[0.65rem] text-muted">אנרגיה עכשיו</p>
          </div>
          <span className="grid size-10 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${energyColor(level)} 16%, transparent)`, color: energyColor(level) }}>
            <BatteryCharging size={18} aria-hidden />
          </span>
        </div>
      </header>

      <div dir="ltr" className="-mx-1 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`עקומת אנרגיה יומית. עכשיו ${Math.round(level * 100)} אחוז.`}>
          <defs>
            <linearGradient id={`heat-${uid}`} x1="0" x2="1" y1="0" y2="0">
              {ordered.map((p, i) => (
                <stop key={i} offset={`${((i + 0.5) / 24) * 100}%`} style={{ stopColor: p.asleep ? "rgb(99 102 241)" : energyColor(p.energy) }} />
              ))}
            </linearGradient>
            <linearGradient id={`fade-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.55" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id={`area-mask-${uid}`}>
              <rect x="0" y="0" width={W} height={H} fill={`url(#fade-${uid})`} />
            </mask>
            <filter id={`glow-${uid}`} x="-10%" y="-40%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Sleep, dimmed. */}
          {ordered.map((p, i) =>
            p.asleep ? <rect key={`s${i}`} x={xFor(i)} y={TOP - 14} width={xFor(1) - xFor(0) + 0.5} height={BOTTOM - TOP + 14} style={{ fill: "var(--fill)" }} /> : null
          )}

          {/* Peak and rest windows. */}
          {windows.map((w) => {
            const x1 = xFor(slotOf(w.startHour));
            const x2 = xFor(slotOf(w.startHour) + (w.endHour - w.startHour));
            const peak = w.kind === "peak";
            return (
              <g key={`${w.kind}-${w.startHour}`}>
                <rect
                  x={x1}
                  y={TOP - 14}
                  width={Math.max(0, x2 - x1)}
                  height={BOTTOM - TOP + 14}
                  rx={10}
                  style={{ fill: peak ? "rgb(245 158 11)" : "rgb(99 102 241)" }}
                  opacity={peak ? 0.1 : 0.07}
                />
                <text x={(x1 + x2) / 2} y={TOP - 3} textAnchor="middle" style={{ fill: peak ? "rgb(217 119 6)" : "rgb(99 102 241)", fontSize: 11, fontWeight: 600 }}>
                  {peak ? "שיא" : "מנוחה"}
                </text>
              </g>
            );
          })}

          {/* The curve: glowing heatmap stroke over a fading heatmap fill. */}
          <path d={area} fill={`url(#heat-${uid})`} mask={`url(#area-mask-${uid})`} />
          <path d={line} fill="none" stroke={`url(#heat-${uid})`} strokeWidth={9} strokeLinecap="round" opacity={0.45} filter={`url(#glow-${uid})`} />
          <motion.path
            d={line}
            fill="none"
            stroke={`url(#heat-${uid})`}
            strokeWidth={3.5}
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Now. */}
          <line x1={nowX} x2={nowX} y1={TOP - 10} y2={BOTTOM} style={{ stroke: "var(--foreground)" }} strokeWidth={1.2} strokeDasharray="3 4" opacity={0.45} />
          {!reduceMotion && (
            // A pulse ring. Scaled, not resized: animating the `r` attribute is
            // a layout-bearing SVG change; a transform is compositor-only.
            <motion.circle
              cx={nowX}
              cy={nowY}
              r={7}
              style={{ fill: energyColor(level), transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 1, opacity: 0.45 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <circle cx={nowX} cy={nowY} r={5.5} style={{ fill: energyColor(level), stroke: "var(--surface)" }} strokeWidth={2.5} />

          {/* Hour axis. */}
          {Array.from({ length: 9 }, (_, i) => i * 3).map((slot) => (
            <text key={slot} x={xFor(slot)} y={BOTTOM + 22} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>
              {hourLabel(START_HOUR + slot).slice(0, 2)}
            </text>
          ))}
        </svg>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground/85">
          <Sun size={15} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
          {energyAdvice(level, windows, now)}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-[0.7rem] text-muted">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: "rgb(245 158 11)" }} aria-hidden />
            שיא
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: "rgb(99 102 241)" }} aria-hidden />
            מנוחה
          </span>
          <span className="flex items-center gap-1">
            <Moon size={11} aria-hidden />
            שינה
          </span>
        </div>
      </div>
    </section>
  );
}
