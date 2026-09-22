import Link from "next/link";
import { notFound } from "next/navigation";
import { Frank_Ruhl_Libre } from "next/font/google";
import { ArrowRight, Check } from "lucide-react";
import { PrintButton } from "@/app/areas/torah/shabbat-print/PrintButton";
import { QrCodeSvg } from "@/components/features/torah/QrCodeSvg";
import { getCurrentUser } from "@/lib/currentUser";
import { learningTopicsRepo, learningResourcesRepo } from "@/lib/db/learning";
import { learningBooksRepo } from "@/lib/db/learningBooks";
import { learningQuotesRepo } from "@/lib/db/learningQuotes";
import { learningQuizAttemptsRepo } from "@/lib/db/learningQuizAttempts";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { toLearningResource, toLearningTopic } from "@/lib/mappers";
import { computeMastery } from "@/lib/learning/mastery";
import { buildStudySheet } from "@/lib/learning/studySheet";
import { FLASHCARD_SOURCE_TYPE } from "@/lib/learning/flashcards";
import { topicDigitalUrl } from "@/lib/learning/topicQr";
import { appBaseUrl } from "@/lib/appUrl";
import "./print.css";

const frank = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], variable: "--font-sheet" });

export const dynamic = "force-dynamic";

/** A deployment with no configured origin gets a sheet with no QR, not a broken page. */
function qrBaseUrl(): string | null {
  try {
    return appBaseUrl();
  } catch {
    return null;
  }
}

/**
 * דף סיכום להדפסה — one topic's study sheet: what is left on the syllabus,
 * quotes saved against any book linked to it, and the mastery score, with a
 * QR back to the digital topic. Server-rendered HTML with a print stylesheet,
 * same approach as the Torah Shabbat sheet
 * (app/areas/torah/shabbat-print/page.tsx) and for the same reason: Hebrew
 * typesets better in the browser's own engine than through a PDF library, and
 * "save as PDF" is already one click away in the print dialog.
 */
export default async function LearningStudySheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: topicId } = await params;
  const user = await getCurrentUser();

  const topicRow = await learningTopicsRepo.get(user.id, topicId);
  if (!topicRow) notFound();
  const topic = toLearningTopic(topicRow);

  const [allResources, allBooks, quizAttempts, flashcards] = await Promise.all([
    learningResourcesRepo.list(user.id),
    learningBooksRepo.listForTopic(user.id, topicId),
    learningQuizAttemptsRepo.listForTopic(user.id, topicId),
    srsCardsRepo.listBySource(user.id, FLASHCARD_SOURCE_TYPE, topicId),
  ]);

  const resources = allResources.filter((r) => r.topic_id === topicId).map(toLearningResource);

  const quotesByBook = await Promise.all(allBooks.map((b) => learningQuotesRepo.listForBook(user.id, b.id)));
  const bookTitleById = new Map(allBooks.map((b) => [b.id, b.title]));
  const quotes = quotesByBook.flat().map((q) => ({
    id: q.id,
    bookId: q.book_id,
    text: q.quote_text,
    note: q.note ?? undefined,
    chapterLabel: q.chapter_label ?? undefined,
    createdAt: q.created_at,
    bookTitle: bookTitleById.get(q.book_id) ?? "",
  }));

  const mastery = computeMastery({
    resources,
    quizFractions: quizAttempts.map((a) => a.score / a.total),
    flashcards: flashcards.map((c) => ({ repetitions: c.repetitions, intervalDays: c.interval_days })),
  });

  const sheet = buildStudySheet({ topic, resources, quotes, mastery });
  const baseUrl = qrBaseUrl();
  const qrUrl = baseUrl ? topicDigitalUrl(baseUrl, topicId) : null;

  return (
    <main className={`${frank.variable} min-h-screen px-4 py-8 sm:px-8 lg:px-16`}>
      <div className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-3 print:hidden">
        <Link
          href={`/areas/learning?open=${topicId}`}
          className="focus-ring glass-control-hover -ms-2.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowRight size={14} aria-hidden />
          חזרה לנושא
        </Link>
        <PrintButton />
      </div>

      <article
        className="study-sheet mx-auto max-w-2xl rounded-2xl border border-hairline-card p-8 shadow-sm sm:p-10"
        style={{ fontFamily: "var(--font-sheet), serif" }}
        lang="he"
        dir="rtl"
      >
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] tracking-[0.25em]" style={{ color: "var(--sheet-muted)" }}>
              מעבדת ידע · Life Plus
            </p>
            <h1 className="mt-1 text-2xl">{sheet.topicTitle}</h1>
            {sheet.category && (
              <p className="mt-0.5 text-sm" style={{ color: "var(--sheet-muted)" }}>
                {sheet.category}
              </p>
            )}
            <p className="mt-2 text-sm font-medium" style={{ color: "var(--sheet-accent)" }}>
              ציון שליטה: {sheet.mastery.score}/100 · {sheet.mastery.label}
            </p>
          </div>
          {qrUrl && (
            <figure className="sheet-qr">
              <QrCodeSvg value={qrUrl} label={`קוד QR לפתיחת הנושא: ${sheet.topicTitle}`} className="sheet-qr-code" />
              <figcaption>סרוק לפתיחת הנושא</figcaption>
            </figure>
          )}
        </header>

        {sheet.isEmpty ? (
          <p className="py-10 text-center text-sm" style={{ color: "var(--sheet-muted)" }}>
            אין עדיין תוכן בנושא הזה — הוסף שלבים או ציטוטים ונסה שוב.
          </p>
        ) : (
          <div className="flex flex-col gap-7">
            {sheet.steps.length > 0 && (
              <section aria-label="שלבי המסלול">
                <h2 className="sheet-section-title">
                  מסלול הלימוד ({sheet.doneCount}/{sheet.totalCount})
                </h2>
                <ol className="flex flex-col gap-2">
                  {sheet.steps.map((step, i) => (
                    <li key={i} className="sheet-step flex items-start gap-2 text-[0.95rem]">
                      <span className="mt-0.5 shrink-0" style={{ color: step.done ? "var(--sheet-accent)" : "var(--sheet-muted)" }}>
                        {step.done ? <Check size={14} aria-hidden /> : <span className="inline-block size-3.5 rounded-full border" style={{ borderColor: "var(--sheet-rule)" }} />}
                      </span>
                      <span style={{ textDecoration: step.done ? "line-through" : undefined, color: step.done ? "var(--sheet-muted)" : undefined }}>
                        {step.title}
                        <span className="ms-1.5 text-xs" style={{ color: "var(--sheet-muted)" }}>
                          · {step.typeLabel}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {sheet.quotes.length > 0 && (
              <section aria-label="ציטוטים שמורים">
                <h2 className="sheet-section-title">ציטוטים</h2>
                <div className="flex flex-col gap-3">
                  {sheet.quotes.map((q, i) => (
                    <div key={i} className="sheet-step text-[0.92rem]">
                      <p>&ldquo;{q.text}&rdquo;</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--sheet-muted)" }}>
                        {q.bookTitle}
                        {q.chapterLabel ? ` · ${q.chapterLabel}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-[0.68rem]" style={{ color: "var(--sheet-muted)" }}>
          <div className="mx-auto mb-3 h-px w-24" style={{ background: "var(--sheet-rule)" }} />
          הופק ממעבדת הידע של {user.hebrew_name?.trim() || user.name}
        </footer>
      </article>
    </main>
  );
}
