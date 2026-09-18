import Link from "next/link";
import { Frank_Ruhl_Libre } from "next/font/google";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { PrintButton } from "@/app/areas/torah/shabbat-print/PrintButton";
import { getCurrentUser } from "@/lib/currentUser";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { resolveUserTimezone } from "@/lib/proactive/timezone";
import { HAVRUTA_INSIGHT_LABELS } from "@/lib/torah/havruta";
import { loadShabbatSheet } from "@/lib/torah/shabbatSheetData";
import "./print.css";

// The traditional Hebrew face for a Shabbat sheet — a serif with real
// Hebrew letterforms, not the app's UI sans.
const frank = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], variable: "--font-sheet" });

export const dynamic = "force-dynamic";

/**
 * "הדפסה לשבת" — the week's learning as a printable pamphlet.
 *
 * Server-rendered HTML with a print stylesheet rather than a PDF library:
 * Hebrew typesetting is better in the browser's own engine, "save as PDF" is
 * already one click in the print dialog, and the page is a fraction of the
 * code (docs/TORAH_KG_PLAN.md, Phase 8).
 */
export default async function ShabbatPrintPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  // The learner's own week boundaries — the same zone the Proactive Engine
  // schedules in, falling back to the app default.
  const timeZone = resolveUserTimezone((await personalDnaRepo.get(user.id).catch(() => null))?.timezone);

  // Only backwards, and only a year: a sheet for a week that has not happened
  // is always empty, and an unbounded offset is an unbounded query.
  const requested = Number(params.week ?? 0);
  const weekOffset = Number.isFinite(requested) ? Math.min(0, Math.max(-52, Math.trunc(requested))) : 0;

  const sheet = await loadShabbatSheet(user.id, timeZone, weekOffset);
  const counts = [
    sheet.summaries.length && `${sheet.summaries.length} סיכומים`,
    sheet.lessons.length && `${sheet.lessons.length} שיעורים`,
    sheet.insights.length && `${sheet.insights.length} דיוני חברותא`,
    sheet.questions.length && `${sheet.questions.length} שאלות`,
    sheet.cards.length && `${sheet.cards.length} כרטיסיות`,
  ].filter(Boolean) as string[];

  return (
    <main className={`${frank.variable} min-h-screen px-4 py-8 sm:px-8 lg:px-16`}>
      {/* Screen-only controls. */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 print:hidden">
        <Link
          href="/areas/torah"
          className="focus-ring glass-control-hover -ms-2.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowRight size={14} aria-hidden />
          מרחב תורה
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">הדפסה לשבת</h1>
            <p className="text-sm text-muted">
              {counts.length ? `הלימוד של השבוע: ${counts.join(" · ")}.` : "אין עדיין לימוד בשבוע הזה."}
            </p>
          </div>
          <PrintButton />
        </div>
        <nav className="flex items-center gap-2 text-xs" aria-label="בחירת שבוע">
          <Link
            href={`/areas/torah/shabbat-print?week=${weekOffset - 1}`}
            className="focus-ring inline-flex items-center gap-1 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-foreground/85 hover:border-gold-line"
          >
            <ChevronRight size={13} aria-hidden />
            שבוע קודם
          </Link>
          {weekOffset < 0 && (
            <Link
              href={`/areas/torah/shabbat-print?week=${weekOffset + 1}`}
              className="focus-ring inline-flex items-center gap-1 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-foreground/85 hover:border-gold-line"
            >
              שבוע הבא
              <ChevronLeft size={13} aria-hidden />
            </Link>
          )}
          <span className="text-muted">{sheet.hebrewRange}</span>
        </nav>
      </div>

      <article
        className="shabbat-sheet mx-auto max-w-3xl rounded-2xl border border-hairline-card p-8 shadow-sm sm:p-12"
        style={{ fontFamily: "var(--font-sheet), serif" }}
        lang="he"
        dir="rtl"
      >
        <header className="mb-8 text-center">
          <p className="text-[0.7rem] tracking-[0.3em]" style={{ color: "var(--sheet-muted)" }}>
            בס״ד
          </p>
          <h1 className="mt-2 text-3xl" style={{ letterSpacing: "0.01em" }}>
            גיליון לשבת · {sheet.parasha}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--sheet-muted)" }}>
            {sheet.hebrewRange}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--sheet-muted)" }}>
            מתוך הלימוד של {user.hebrew_name?.trim() || user.name} · מרחב תורה
          </p>
          <div className="mx-auto mt-4 h-px w-40" style={{ background: "var(--sheet-rule)" }} />
        </header>

        {sheet.isEmpty ? (
          <p className="py-10 text-center text-sm" style={{ color: "var(--sheet-muted)" }}>
            בשבוע הזה עוד לא נרשם לימוד. סכם שיעור, כתוב סיכום או פתח דיון בחברותא — והכל יופיע כאן.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {sheet.summaries.length > 0 && (
              <section aria-label="סיכומי הלימוד">
                <h2 className="sheet-section-title">סיכומי השבוע</h2>
                <div className="flex flex-col gap-5">
                  {sheet.summaries.map((summary) => (
                    <div key={summary.id} className="sheet-block">
                      <h3 className="text-base">
                        {summary.title}
                        {summary.subject && (
                          <span className="ms-2 text-xs font-normal" style={{ color: "var(--sheet-muted)" }}>
                            · {summary.subject}
                          </span>
                        )}
                      </h3>
                      <p className="mt-1 whitespace-pre-line text-[0.95rem]">{summary.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sheet.lessons.length > 0 && (
              <section aria-label="שיעורים">
                <h2 className="sheet-section-title">מן השיעורים</h2>
                <div className="flex flex-col gap-5">
                  {sheet.lessons.map((lesson) => (
                    <div key={lesson.id} className="sheet-block">
                      <h3 className="text-base">
                        {lesson.title}
                        {lesson.speaker && (
                          <span className="ms-2 text-xs font-normal" style={{ color: "var(--sheet-muted)" }}>
                            · {lesson.speaker}
                          </span>
                        )}
                      </h3>
                      {lesson.summary && <p className="mt-1 text-[0.95rem]">{lesson.summary}</p>}
                      {lesson.keyPoints.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1 ps-4 text-[0.92rem]" style={{ listStyleType: "hebrew" }}>
                          {lesson.keyPoints.map((point, i) => (
                            <li key={i} className="list-item">
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sheet.insights.length > 0 && (
              <section aria-label="תובנות מן החברותא">
                <h2 className="sheet-section-title">מן החברותא</h2>
                <div className="flex flex-col gap-4">
                  {sheet.insights.map((thread) => (
                    <div key={thread.threadId} className="sheet-block">
                      <h3 className="text-sm" style={{ color: "var(--sheet-muted)" }}>
                        {thread.title}
                      </h3>
                      <ul className="mt-1 flex flex-col gap-1.5">
                        {thread.items.map((insight, i) => (
                          <li key={i} className="text-[0.95rem]">
                            <span className="font-bold" style={{ color: "var(--sheet-gold)" }}>
                              {HAVRUTA_INSIGHT_LABELS[insight.kind]}:{" "}
                            </span>
                            {insight.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sheet.questions.length > 0 && (
              <section aria-label="שאלות לעיון">
                <h2 className="sheet-section-title">שאלות לשולחן שבת</h2>
                <ol className="flex flex-col gap-4">
                  {sheet.questions.map((question, index) => (
                    <li key={question.id} className="sheet-block">
                      <p className="text-[0.95rem] font-bold">
                        {index + 1}. {question.prompt}
                      </p>
                      <p className="mt-1 border-s-2 ps-3 text-[0.9rem]" style={{ borderColor: "var(--sheet-rule)" }}>
                        {question.answer}
                      </p>
                      {question.source && (
                        <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--sheet-muted)" }}>
                          מתוך {question.source}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {sheet.cards.length > 0 && (
              <section aria-label="כרטיסיות לחזרה">
                <h2 className="sheet-section-title">לחזרה מהירה</h2>
                <div className="sheet-columns">
                  {sheet.cards.map((card) => (
                    <div key={card.id} className="sheet-block mb-2.5">
                      <p className="text-[0.9rem] font-bold">{card.front}</p>
                      <p className="text-[0.88rem]" style={{ color: "var(--sheet-muted)" }}>
                        {card.back}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-[0.7rem]" style={{ color: "var(--sheet-muted)" }}>
          <div className="mx-auto mb-3 h-px w-24" style={{ background: "var(--sheet-rule)" }} />
          שבת שלום · הגיליון הופק ממרחב תורה ואינו פסק הלכה
        </footer>
      </article>
    </main>
  );
}
