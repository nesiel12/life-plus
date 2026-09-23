import { Bug } from "lucide-react";

interface TopicBloopersBoxProps {
  text: string;
}

/**
 * The lesson's historical blooper/disaster (LessonBlockContent.
 * blooperOrDisaster — the "first computer moth," NASA's metric/imperial
 * mixup, Python named after Monty Python, that kind of thing). Same string
 * Phase 1/2's BlooperSection rendered as a plain card; this is a visual-only
 * replacement — no AI schema change, nothing to regenerate — with a
 * hazard-stripe accent so it reads as "something went wrong here" at a
 * glance instead of blending into the other section cards.
 */
export function TopicBloopersBox({ text }: TopicBloopersBoxProps) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-accent-family/25 bg-accent-family/5 p-6"
      style={{
        borderInlineStartWidth: 6,
        borderInlineStartColor: "var(--accent-family)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5 opacity-60"
        style={{
          backgroundImage: "repeating-linear-gradient(-45deg, var(--accent-family) 0, var(--accent-family) 8px, transparent 8px, transparent 16px)",
        }}
      />
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bug size={15} className="text-accent-family" aria-hidden />
        כשלא הלך כמתוכנן
      </h3>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </section>
  );
}
