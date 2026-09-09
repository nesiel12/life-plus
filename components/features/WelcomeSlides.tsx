"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CalendarClock, Compass, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lifeplus.welcome.v1";
const REPLAY_EVENT = "lifeplus:replay-welcome";

/** Re-open the welcome tour (Settings → "צפה בסיור שוב"). Clears the
 *  first-run flag and tells the mounted <WelcomeSlides> to show itself. */
export function replayWelcomeTour(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

interface Slide {
  icon: LucideIcon;
  colorVar: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    colorVar: "--gold",
    title: "Life Plus מכיר אותך",
    body: "לא עוד אפליקציה שאתה צריך לתחזק. ככל שתשתמש, היא לומדת את השגרה, סדרי העדיפויות והקצב שלך — ומתחילה לעבוד בשבילך.",
  },
  {
    icon: CalendarClock,
    colorVar: "--accent-career",
    title: "היא אומרת לך מה עכשיו",
    body: "יומן, משימות, לוז יומי והרגלים במקום אחד. כל בוקר תדע מה מחכה לך, מתי אתה פנוי, ומה הדבר הבא — בלי לחפש.",
  },
  {
    icon: Compass,
    colorVar: "--accent-learning",
    title: "איך מנווטים",
    body: "בצד המסך יש סרגל עם תחומי החיים — יומן, לימודים, תורה, משפחה, בריאות, כספים, מרחב אישי וציר הזמן. הלוגו למעלה תמיד מחזיר למסך הבית, וכפתור ⌘K בכל מקום פותח לכידה מהירה של רגע או משימה.",
  },
  {
    icon: ShieldCheck,
    colorVar: "--accent-family",
    title: "והכול פרטי ובשליטתך",
    body: "כלום לא נשלח בלי שתאשר. מדורים אישיים והכספים ננעלים מאחורי טביעת אצבע, וההתראות באות אליך רק מתי שביקשת.",
  },
];

export function WelcomeSlides() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // Private mode / blocked storage — skip the intro rather than showing
      // it on every load.
    }
    function replay() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // If we can't persist it, still close for this session.
    }
    setOpen(false);
  }

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Icon = slide.icon;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      closeOnBackdropClick={false}
      closeOnEscape
      zIndex={Z_INDEX.welcome}
      backdropClassName="items-center bg-black/60"
      panelClassName="max-w-md flex flex-col gap-6 p-8"
    >
      <div className="flex items-center justify-between">
        <Logo size={22} />
        <button
          onClick={dismiss}
          className="focus-ring rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          דלג
        </button>
      </div>

      <div className="relative min-h-[9.5rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex flex-col gap-3"
          >
            <span
              className="flex size-11 items-center justify-center rounded-2xl"
              style={{
                background: `color-mix(in srgb, var(${slide.colorVar}) 15%, transparent)`,
                color: `var(${slide.colorVar})`,
              }}
            >
              <Icon size={22} aria-hidden />
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{slide.title}</h2>
            <p className="text-sm leading-relaxed text-muted">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-gold-ink" : "w-1.5 bg-fill-subtle"
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="focus-ring rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              חזור
            </button>
          )}
          <button
            onClick={() => (isLast ? dismiss() : setIndex((i) => i + 1))}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80"
          >
            {isLast ? "בוא נתחיל" : "הבא"}
            {!isLast && <ArrowLeft size={14} aria-hidden />}
          </button>
        </div>
      </div>
    </Modal>
  );
}
