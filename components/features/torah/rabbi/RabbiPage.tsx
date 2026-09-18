"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpenText,
  CalendarRange,
  Check,
  ExternalLink,
  Globe,
  GraduationCap,
  Landmark,
  Library,
  Loader2,
  Mail,
  MapPin,
  MessagesSquare,
  MonitorPlay,
  NotebookPen,
  Pencil,
  PenLine,
  Phone,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { EntityHub } from "@/components/features/torah/EntityHub";
import { EditRabbiModal } from "@/components/features/torah/EditRabbiModal";
import { ActionPill, PageSection, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { SeferCover } from "@/components/features/torah/hub/SeferCover";
import { InvestigationTrail } from "@/components/features/torah/hub/InvestigationTrail";
import { MediaLessonsSection } from "@/components/features/torah/hub/MediaLessonsSection";
import { useEnrichment } from "@/components/features/torah/hub/useEnrichment";
import { useTorahEntityNavigation } from "@/components/features/torah/hub/useTorahEntityNavigation";
import { bookTitleKey, hebrewOnly, hebrewYearLabel, isHebrewText, lifespanLabel } from "@/lib/torah/hebrew";
import {
  findLibraryBook,
  findLibraryRabbi,
  hostLabel,
  rabbiInitials,
  safeHttpUrl,
  telHref,
  whatsappHref,
  youtubeChannelHref,
  type LineageEntry,
  type RabbiWork,
  type SuggestedLink,
} from "@/lib/torah/rabbiProfile";
import { sefariaAuthorUrl, webSearchUrl } from "@/lib/torah/links";
import { recordTrailVisit } from "@/lib/torah/trail";
import { cn } from "@/lib/utils";
import { HavrutaSection } from "@/components/features/torah/havruta/HavrutaSection";
import { AudioAttachmentWidget } from "@/components/features/torah/attachments/AudioAttachmentWidget";
import { ScanNoteButton } from "@/components/features/torah/scan/HandwritingScanner";
import type { Book, Rabbi } from "@/types";

interface RabbiRefs {
  sefaria?: { slug?: string; hebrewAliases?: string[]; hebrewWikipediaUrl?: string | null };
}

/**
 * A rabbi's profile — the Rabbi half of the investigation loop.
 *
 * Who he was (biography, the world he lived in, what he built), where his
 * Torah came from and where it went (teachers → him → students, each a link
 * onward), everything he wrote (each sefer opens its own page, which links
 * back here), how to reach him and his community when he is a living rav,
 * and his shiurim.
 *
 * Provenance is always visible: Sefaria's records render as facts, a model's
 * inferences render dashed with their confidence, and the user's own entries
 * outrank both. An AI guess never looks like knowledge.
 */
export function RabbiPage({ rabbiId }: { rabbiId: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const navigateEntity = useTorahEntityNavigation();

  const hydrated = useAtlasStore((s) => s.hydrated);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const books = useAtlasStore((s) => s.books);
  const applyRabbiPatch = useAtlasStore((s) => s.applyRabbiPatch);
  const applyBookPatch = useAtlasStore((s) => s.applyBookPatch);
  const updateRabbi = useAtlasStore((s) => s.updateRabbi);
  const deleteRabbi = useAtlasStore((s) => s.deleteRabbi);
  const openOrCreateBook = useAtlasStore((s) => s.openOrCreateBook);
  const openOrCreateRabbi = useAtlasStore((s) => s.openOrCreateRabbi);

  const rabbi = useMemo(() => rabbis.find((r) => r.id === rabbiId) ?? null, [rabbis, rabbiId]);
  const [editing, setEditing] = useState(false);

  const displayName = rabbi ? (hebrewOnly(rabbi.hebrewName) ?? rabbi.name) : "";

  useEffect(() => {
    if (rabbi) recordTrailVisit({ type: "rabbi", id: rabbi.id, label: displayName });
  }, [rabbi?.id, displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  const enrichment = useEnrichment<{ rabbi?: Rabbi; books?: Book[]; error?: string }>({
    url: `/api/torah/rabbis/${rabbiId}/enrich`,
    needed: Boolean(rabbi && !isHebrewText(rabbi.bio)),
    key: `rabbi:${rabbiId}`,
    onResult: (data) => {
      if (data.rabbi) applyRabbiPatch(data.rabbi);
      for (const book of data.books ?? []) applyBookPatch(book);
    },
  });

  if (!hydrated) return null;

  if (!rabbi) {
    return (
      <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
        <BackLink />
        <SectionPlaceholder icon={GraduationCap} title="הרב לא נמצא" body="ייתכן שהוא נמחק מהספרייה.">
          <Link href="/areas/torah" className="focus-ring rounded-full bg-gold px-3 py-1.5 text-xs text-white">
            חזרה לספרייה
          </Link>
        </SectionPlaceholder>
      </main>
    );
  }

  const refs = (rabbi.externalRefs ?? {}) as RabbiRefs;
  const slug = refs.sefaria?.slug;
  const aliases = (refs.sefaria?.hebrewAliases ?? []).filter((a) => a !== displayName).slice(0, 3);
  const lifespan = lifespanLabel(rabbi.birthYear, rabbi.deathYear);
  const running = enrichment.running;
  const enriched = isHebrewText(rabbi.bio);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <InvestigationTrail current={{ type: "rabbi", id: rabbi.id }} />
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden rounded-3xl border border-hairline-card bg-surface p-5 shadow-[0_24px_60px_-40px_rgba(16,16,20,0.45)] sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--gold-soft),transparent_55%)]"
        />
        <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-start">
          <Portrait name={displayName} url={rabbi.portraitUrl} />

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 sm:items-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {rabbi.era && (
                <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-medium text-gold-ink">{rabbi.era}</span>
              )}
              {rabbi.isContemporary && (
                <span className="rounded-full bg-accent-health/12 px-2.5 py-0.5 text-xs font-medium text-accent-health">
                  רב בן זמננו
                </span>
              )}
              {slug && enriched && (
                <span className="flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-0.5 text-xs text-muted">
                  <Check size={11} aria-hidden />
                  מבוסס על רשומת ספריא
                </span>
              )}
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">{displayName}</h1>
            {aliases.length > 0 && <p className="text-sm text-muted">הידוע גם בכינוי {aliases.join(", ")}</p>}
            {rabbi.title && <p className="text-[0.95rem] text-foreground/75">{rabbi.title}</p>}

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted sm:justify-start">
              {lifespan && (
                <span className="flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface/70 px-2.5 py-1">
                  <CalendarRange size={12} className="text-gold-ink" aria-hidden />
                  {lifespan}
                </span>
              )}
              {(rabbi.birthPlace || rabbi.deathPlace) && (
                <span className="flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface/70 px-2.5 py-1">
                  <MapPin size={12} className="text-gold-ink" aria-hidden />
                  {[rabbi.birthPlace, rabbi.deathPlace].filter(Boolean).join(" ← ")}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
              <ActionPill
                icon={running ? Loader2 : enriched ? RefreshCw : Sparkles}
                busy={running}
                onClick={() => void enrichment.run(enriched)}
                variant={enriched ? "quiet" : "gold"}
              >
                {running ? "בונה פרופיל…" : enriched ? "רענן פרופיל" : "בנה פרופיל מלא"}
              </ActionPill>
              <ActionPill icon={PenLine} onClick={() => setEditing(true)}>
                עריכה
              </ActionPill>
              {slug && (
                <ActionPill icon={BookOpenText} href={sefariaAuthorUrl(slug)}>
                  בספריא
                </ActionPill>
              )}
              {refs.sefaria?.hebrewWikipediaUrl && (
                <ActionPill icon={Globe} href={refs.sefaria.hebrewWikipediaUrl}>
                  ויקיפדיה
                </ActionPill>
              )}
            </div>
            {enrichment.error && <p className="text-xs text-accent-family">{enrichment.error}</p>}
          </div>
        </div>
      </motion.header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <PageSection id="life" icon={ScrollText} tone="faith" title="תולדות חייו" delay={0.05}>
            {enriched ? (
              <div className="flex flex-col gap-4">
                {rabbi.bio!.split(/\n\s*\n/).map((paragraph, i) => (
                  <p key={i} className="text-[0.95rem] leading-8 text-foreground/85">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            ) : running ? (
              <WritingSkeleton label="כותב את תולדות חייו בעברית…" />
            ) : (
              <SectionPlaceholder
                icon={ScrollText}
                title="עדיין אין ביוגרפיה"
                body="הפרופיל נבנה מרשומת ספריא (כשיש) ונכתב בעברית ישירות — תולדות חייו, רבותיו, תלמידיו וספריו."
              >
                <ActionPill icon={Sparkles} onClick={() => void enrichment.run(false)} variant="gold">
                  בנה פרופיל מלא
                </ActionPill>
              </SectionPlaceholder>
            )}
          </PageSection>

          {(isHebrewText(rabbi.historicalContext) || (rabbi.achievements?.length ?? 0) > 0) && (
            <PageSection id="background" icon={Landmark} tone="gold" title="רקע היסטורי והישגים" delay={0.1}>
              {isHebrewText(rabbi.historicalContext) && (
                <p className="text-[0.95rem] leading-8 text-foreground/85">{rabbi.historicalContext}</p>
              )}
              {(rabbi.achievements?.length ?? 0) > 0 && (
                <ul className={cn("grid gap-2.5 sm:grid-cols-2", isHebrewText(rabbi.historicalContext) && "mt-5")}>
                  {rabbi.achievements!.map((achievement) => (
                    <li
                      key={achievement}
                      className="flex gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/50 p-3 text-sm leading-relaxed text-foreground/85"
                    >
                      <Award size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
                      {achievement}
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          )}

          <LineageSection
            rabbi={rabbi}
            name={displayName}
            rabbis={rabbis}
            running={running}
            onOpen={async (entry) => {
              const opened = await openOrCreateRabbi({
                name: entry.name,
                sefariaSlug: entry.sefariaSlug,
                relatedRabbiId: rabbi.id,
                relation: entry.relation,
                origin: entry.origin,
                confidence: entry.confidence,
              });
              router.push(`/areas/torah/rabbis/${opened.id}`);
            }}
          />

          <BookshelfSection
            rabbi={rabbi}
            name={displayName}
            books={books}
            running={running}
            onEnrich={() => void enrichment.run(false)}
            onOpen={async (work) => {
              const opened = await openOrCreateBook({
                title: work.title,
                sefariaTitle: work.sefariaTitle,
                authorRabbiId: rabbi.id,
                authorOrigin: work.origin,
                authorConfidence: work.confidence,
                authorName: displayName,
              });
              router.push(`/areas/torah/books/${opened.id}`);
            }}
          />

          <HavrutaSection key={`havruta-${rabbi.id}`} subjectType="rabbi" subjectId={rabbi.id} subjectTitle={displayName} />

          <AudioAttachmentWidget key={`audio-${rabbi.id}`} entityType="rabbi" entityId={rabbi.id} entityLabel={displayName} />

          <PageSection
            id="my-notes"
            icon={NotebookPen}
            tone="knowledge"
            title="הסיכומים וההערות שלי"
            subtitle={`מה שלמדת מ${displayName} ועליו`}
            delay={0.2}
            action={<ScanNoteButton target={{ type: "rabbi", id: rabbi.id, label: displayName }} />}
          >
            <EntityHub
              embedded
              entityType="rabbi"
              entityId={rabbi.id}
              name={displayName}
              onBack={() => {}}
              onEntityClick={navigateEntity}
              kinds={["summaries", "sources", "audios"]}
            />
          </PageSection>
        </div>

        <aside className="grid min-w-0 content-start items-start gap-5 md:grid-cols-2 xl:flex xl:flex-col" aria-label="פרטים נוספים על הרב">
          <ContactSection rabbi={rabbi} name={displayName} onSave={(patch) => updateRabbi(rabbi.id, patch)} />
          <AtAGlance rabbi={rabbi} />
          {(rabbi.locations?.length ?? 0) > 0 && <TimelineSection rabbi={rabbi} />}
        </aside>
      </div>

      <div className="mt-5">
        <MediaLessonsSection
          entityType="rabbi"
          entityId={rabbi.id}
          name={displayName}
          channelUrl={rabbi.youtubeChannelUrl}
          delay={0.1}
        />
      </div>

      <EditRabbiModal
        rabbi={editing ? rabbi : null}
        onClose={() => setEditing(false)}
        onSave={(id, patch) => void updateRabbi(id, patch).catch(() => {})}
        onDelete={(id) => {
          void deleteRabbi(id)
            .then(() => router.push("/areas/torah"))
            .catch(() => {});
        }}
      />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/areas/torah"
      className="focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
    >
      <ArrowRight size={14} aria-hidden />
      מרחב תורה
    </Link>
  );
}

function Portrait({ name, url }: { name: string; url?: string }) {
  return (
    <div className="relative shrink-0">
      <div className="rounded-full bg-gradient-to-br from-gold via-gold-line to-gold-ink p-[3px] shadow-[0_18px_40px_-20px_rgba(135,102,40,0.7)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="size-32 rounded-full border-4 border-surface object-cover sm:size-36" />
        ) : (
          <div
            role="img"
            aria-label={`דיוקן של ${name}`}
            className="grid size-32 place-items-center rounded-full border-4 border-surface bg-[radial-gradient(circle_at_30%_25%,#3b2f22,#15110c)] text-4xl font-semibold text-[#e7cf9c] sm:size-36"
          >
            {rabbiInitials(name)}
          </div>
        )}
      </div>
    </div>
  );
}

function WritingSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2.5" role="status">
      <p className="flex items-center gap-2 text-xs text-gold-ink">
        <Sparkles size={13} className="animate-pulse" aria-hidden />
        {label}
      </p>
      {["w-full", "w-11/12", "w-full", "w-4/5", "w-2/3"].map((width, i) => (
        <span key={i} className={`h-3 animate-pulse rounded bg-fill ${width}`} aria-hidden />
      ))}
    </div>
  );
}

/** Provenance, rendered: a record, a model's guess with its confidence, or the user's own. */
function OriginBadge({ origin, confidence }: { origin: LineageEntry["origin"]; confidence: number }) {
  if (origin === "import") {
    return <span className="text-[0.6rem] text-muted">ספריא</span>;
  }
  if (origin === "ai") {
    return (
      <span className="rounded-full bg-fill px-1.5 py-px text-[0.6rem] text-muted" title="הסקה של בינה מלאכותית — כדאי לאמת">
        משוער · <span className="ltr tabular-nums">{Math.round(confidence * 100)}%</span>
      </span>
    );
  }
  return null;
}

// ── Lineage ───────────────────────────────────────────────────────────────

function LineageSection({
  rabbi,
  name,
  rabbis,
  running,
  onOpen,
}: {
  rabbi: Rabbi;
  name: string;
  rabbis: Rabbi[];
  running: boolean;
  onOpen: (entry: LineageEntry) => Promise<void>;
}) {
  const teachers = (rabbi.lineage ?? []).filter((l) => l.relation === "teacher");
  const students = (rabbi.lineage ?? []).filter((l) => l.relation === "student");

  return (
    <PageSection
      id="lineage"
      icon={Users}
      tone="learning"
      title="שלשלת המסורה"
      subtitle="רבותיו ותלמידיו — כל שם פותח דף משלו"
      delay={0.12}
    >
      {teachers.length === 0 && students.length === 0 ? (
        running ? (
          <WritingSkeleton label="מאתר את רבותיו ותלמידיו…" />
        ) : (
          <SectionPlaceholder icon={Users} title="השלשלת עדיין ריקה" body="בניית הפרופיל תאתר את רבותיו ותלמידיו מרשומות ספריא ומהידע התורני." />
        )
      ) : (
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <PeopleColumn title="רבותיו" people={teachers} rabbis={rabbis} onOpen={onOpen} empty="לא ידועים רבותיו" />
          <div className="flex flex-col items-center gap-2 py-2" aria-hidden>
            <span className="hidden h-8 w-px bg-gradient-to-b from-transparent to-gold-line md:block" />
            <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-ink text-lg font-semibold text-white shadow-lg">
              {rabbiInitials(name)}
            </span>
            <span className="max-w-28 text-center text-xs font-medium text-foreground">{name}</span>
            <span className="hidden h-8 w-px bg-gradient-to-b from-gold-line to-transparent md:block" />
          </div>
          <PeopleColumn title="תלמידיו" people={students} rabbis={rabbis} onOpen={onOpen} empty="לא ידועים תלמידיו" />
        </div>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline-card pt-3 text-[0.65rem] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-foreground/40" aria-hidden />
          מתועד
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-foreground/40" aria-hidden />
          משוער — הסקה שכדאי לאמת
        </span>
      </p>
    </PageSection>
  );
}

function PeopleColumn({
  title,
  people,
  rabbis,
  onOpen,
  empty,
}: {
  title: string;
  people: LineageEntry[];
  rabbis: Rabbi[];
  onOpen: (entry: LineageEntry) => Promise<void>;
  empty: string;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted">{title}</p>
      {people.length === 0 ? (
        <p className="text-xs text-muted/70">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {people.map((person) => {
            const inLibrary = findLibraryRabbi(person, rabbis);
            const key = `${person.relation}:${person.name}`;
            const className = cn(
              "focus-ring group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start transition-colors hover:border-gold-line hover:bg-gold-soft/40",
              person.origin === "ai" ? "border-dashed border-foreground/25" : "border-hairline-card bg-surface"
            );
            const content = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill text-[0.65rem] font-semibold text-foreground/70">
                  {opening === key ? <Loader2 size={13} className="animate-spin" aria-hidden /> : rabbiInitials(person.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{person.name}</span>
                  <span className="flex items-center gap-1.5">
                    {inLibrary && <span className="text-[0.6rem] font-medium text-gold-ink">בספרייה שלך</span>}
                    <OriginBadge origin={person.origin} confidence={person.confidence} />
                  </span>
                </span>
              </>
            );
            return (
              <li key={key}>
                {inLibrary ? (
                  <Link href={`/areas/torah/rabbis/${inLibrary.id}`} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={opening !== null}
                    className={className}
                    onClick={async () => {
                      setOpening(key);
                      setError(null);
                      try {
                        await onOpen(person);
                      } catch {
                        setError("הפתיחה נכשלה. נסה שוב.");
                        setOpening(null);
                      }
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}

// ── Bookshelf ─────────────────────────────────────────────────────────────

function BookshelfSection({
  rabbi,
  name,
  books,
  running,
  onEnrich,
  onOpen,
}: {
  rabbi: Rabbi;
  name: string;
  books: Book[];
  running: boolean;
  onEnrich: () => void;
  onOpen: (work: RabbiWork) => Promise<void>;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shelf = useMemo(() => {
    const works = rabbi.works ?? [];
    // Books the user linked to this rabbi that no profile source listed.
    const extra = books
      .filter((b) => b.authorRabbiId === rabbi.id)
      .filter((b) => !works.some((w) => findLibraryBook(w, [b])))
      .map((b): RabbiWork => ({ title: b.hebrewTitle ?? b.title, year: b.publishedYear, origin: "user", confidence: 1 }));
    return [...extra, ...works];
  }, [rabbi.works, rabbi.id, books]);

  return (
    <PageSection
      id="bookshelf"
      icon={Library}
      tone="faith"
      title="מדף הספרים"
      subtitle={shelf.length ? `${shelf.length} חיבורים — כל ספר פותח דף משלו` : `חיבוריו של ${name}`}
      delay={0.15}
    >
      {shelf.length === 0 ? (
        running ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-36 w-26 animate-pulse rounded-lg bg-fill" />
                <div className="h-3 w-20 animate-pulse rounded bg-fill" />
              </div>
            ))}
          </div>
        ) : (
          <SectionPlaceholder icon={Library} title="המדף עדיין ריק" body="בניית הפרופיל תמלא את המדף בספריו.">
            <ActionPill icon={Sparkles} onClick={onEnrich} variant="gold">
              מלא את המדף
            </ActionPill>
          </SectionPlaceholder>
        )
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
            {shelf.map((work) => {
              const libraryBook = findLibraryBook(work, books);
              const key = bookTitleKey(work.title);
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={async () => {
                      setOpening(key);
                      setError(null);
                      try {
                        await onOpen(work);
                      } catch {
                        setError("פתיחת הספר נכשלה. נסה שוב.");
                        setOpening(null);
                      }
                    }}
                    className="focus-ring group flex w-full flex-col items-center gap-2 rounded-xl p-1.5 text-center disabled:opacity-70"
                    aria-label={`פתח את ${work.title}`}
                  >
                    <span className="relative transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:rotate-[-1deg]">
                      <SeferCover title={work.title} coverUrl={libraryBook?.coverImageUrl} size="md" caption={name} />
                      {libraryBook && (
                        <span className="absolute inset-x-0 -top-2 mx-auto w-fit whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-[0.58rem] font-medium text-white shadow">
                          בספרייה שלך
                        </span>
                      )}
                      {opening === key && (
                        <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/45">
                          <Loader2 size={18} className="animate-spin text-white" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{work.title}</span>
                    <span className="flex flex-wrap items-center justify-center gap-1.5 text-[0.65rem] text-muted">
                      {work.year !== undefined && <span>{hebrewYearLabel(work.year)}</span>}
                      <OriginBadge origin={work.origin} confidence={work.confidence} />
                    </span>
                    {work.description && (
                      <span className="line-clamp-2 text-[0.7rem] leading-relaxed text-muted">{work.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="mt-3 text-xs text-accent-family">{error}</p>}
        </>
      )}
    </PageSection>
  );
}

// ── Contact & community ───────────────────────────────────────────────────

type ContactKey = "phone" | "whatsappUrl" | "websiteUrl" | "youtubeChannelUrl" | "email";

interface ContactField {
  key: ContactKey;
  label: string;
  icon: LucideIcon;
  placeholder: string;
  href: (value: string) => string | null;
  display: (value: string) => string;
  /** A web search that helps the user find this detail. */
  search?: (name: string) => string;
  /** Only meaningful for a living rav. */
  contemporaryOnly?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONTACT_FIELDS: ContactField[] = [
  {
    key: "phone",
    label: "טלפון",
    icon: Phone,
    placeholder: "050-0000000",
    href: (v) => telHref(v),
    display: (v) => v,
    contemporaryOnly: true,
  },
  {
    key: "whatsappUrl",
    label: "קבוצת וואטסאפ רשמית",
    icon: MessagesSquare,
    placeholder: "https://chat.whatsapp.com/…",
    href: (v) => whatsappHref(v),
    display: (v) => (/[a-z]/i.test(v) ? "הצטרפות לקבוצה" : v),
    search: (name) => webSearchUrl(`${name} קבוצת וואטסאפ רשמית`),
    contemporaryOnly: true,
  },
  {
    key: "websiteUrl",
    label: "אתר רשמי",
    icon: Globe,
    placeholder: "https://…",
    href: (v) => safeHttpUrl(v),
    display: (v) => hostLabel(safeHttpUrl(v) ?? v),
    search: (name) => webSearchUrl(`${name} אתר רשמי`),
  },
  {
    key: "youtubeChannelUrl",
    label: "ערוץ יוטיוב",
    icon: MonitorPlay,
    placeholder: "https://www.youtube.com/@…",
    href: (v) => youtubeChannelHref(v),
    display: (v) => {
      const url = youtubeChannelHref(v);
      return url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) : v;
    },
    search: (name) => webSearchUrl(`${name} ערוץ יוטיוב שיעורים`),
  },
  {
    key: "email",
    label: "דוא״ל",
    icon: Mail,
    placeholder: "name@example.com",
    href: (v) => (EMAIL.test(v.trim()) ? `mailto:${v.trim()}` : null),
    display: (v) => v,
    contemporaryOnly: true,
  },
];

function ContactSection({
  rabbi,
  name,
  onSave,
}: {
  rabbi: Rabbi;
  name: string;
  onSave: (patch: Partial<Rabbi>) => Promise<void>;
}) {
  const historical = rabbi.isContemporary === false;
  // For a historical figure the personal-contact rows are hidden unless the
  // user filled one in — "the Rambam's phone number" is not a placeholder
  // worth showing. Websites and channels about his Torah still apply.
  const fields = CONTACT_FIELDS.filter((f) => !historical || !f.contemporaryOnly || rabbi[f.key]);
  const suggestions = (rabbi.suggestedLinks ?? []).filter(
    (s) => !(s.kind === "website" ? rabbi.websiteUrl : rabbi.youtubeChannelUrl)
  );

  async function resolveSuggestion(suggestion: SuggestedLink, accept: boolean) {
    const remaining = (rabbi.suggestedLinks ?? []).filter((s) => s.url !== suggestion.url);
    await onSave({
      suggestedLinks: remaining,
      ...(accept ? { [suggestion.kind === "website" ? "websiteUrl" : "youtubeChannelUrl"]: suggestion.url } : {}),
    });
  }

  return (
    <PageSection
      id="contact"
      icon={MessagesSquare}
      tone="knowledge"
      title={historical ? "אתרים וערוצים" : "יצירת קשר וקהילה"}
      subtitle={historical ? "מקומות שבהם תורתו נלמדת היום" : "פרטי קשר, קבוצות וערוצים רשמיים"}
      delay={0.05}
    >
      <ul className="flex flex-col gap-2">
        {fields.map((field) => (
          <ContactRow key={field.key} field={field} value={rabbi[field.key]} name={name} onSave={onSave} />
        ))}
      </ul>

      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-hairline-card pt-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Sparkles size={12} className="text-gold-ink" aria-hidden />
            הצעות לאימות
          </p>
          {suggestions.map((suggestion) => (
            <div key={suggestion.url} className="flex items-center gap-2 rounded-xl border border-dashed border-gold-line p-2.5">
              <a
                href={suggestion.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring min-w-0 flex-1 truncate text-xs text-foreground/85 underline-offset-2 hover:underline"
              >
                {suggestion.kind === "website" ? "אתר: " : "ערוץ: "}
                <span className="ltr">{hostLabel(suggestion.url)}</span>
              </a>
              <button
                type="button"
                onClick={() => void resolveSuggestion(suggestion, true).catch(() => {})}
                aria-label="אשר ושמור"
                className="focus-ring grid size-7 place-items-center rounded-full bg-accent-health/12 text-accent-health"
              >
                <Check size={13} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void resolveSuggestion(suggestion, false).catch(() => {})}
                aria-label="התעלם מההצעה"
                className="focus-ring grid size-7 place-items-center rounded-full bg-fill text-muted"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}

function ContactRow({
  field,
  value,
  name,
  onSave,
}: {
  field: ContactField;
  value?: string;
  name: string;
  onSave: (patch: Partial<Rabbi>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const Icon = field.icon;
  const href = value ? field.href(value) : null;

  useEffect(() => setDraft(value ?? ""), [value]);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && !field.href(trimmed)) {
      setError(field.key === "phone" ? "מספר הטלפון אינו תקין" : "הערך אינו תקין");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ [field.key]: trimmed });
      setEditing(false);
    } catch {
      setError("השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-1.5 rounded-xl border border-gold-line bg-surface p-2.5">
        <label className="flex items-center gap-2 text-xs text-muted">
          <Icon size={13} aria-hidden />
          {field.label}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={field.placeholder}
            aria-label={field.label}
            dir="ltr"
            autoFocus
            className="focus-ring ltr min-w-0 flex-1 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="שמור"
            className="focus-ring grid size-8 place-items-center rounded-lg bg-foreground text-background disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(value ?? "");
              setError(null);
            }}
            aria-label="בטל"
            className="focus-ring grid size-8 place-items-center rounded-lg text-muted"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
        {error && <p className="text-xs text-accent-family">{error}</p>}
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          href ? "bg-accent-knowledge/12 text-accent-knowledge" : "bg-fill-subtle text-muted"
        )}
        aria-hidden
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.65rem] text-muted">{field.label}</span>
        {href && value ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="focus-ring block truncate text-sm text-foreground underline-offset-2 hover:underline"
          >
            <span className={field.key === "whatsappUrl" && /[a-z]/i.test(value) ? undefined : "ltr"}>
              {field.display(value)}
            </span>
          </a>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted/80">
            לא הוזן
            {field.search && (
              <a
                href={field.search(name)}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring flex items-center gap-0.5 text-gold-ink hover:underline"
              >
                חפש
                <ExternalLink size={10} aria-hidden />
              </a>
            )}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${value ? "ערוך" : "הוסף"} ${field.label}`}
        className="focus-ring grid size-7 place-items-center rounded-lg text-muted opacity-60 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Pencil size={12} aria-hidden />
      </button>
    </li>
  );
}

// ── At a glance & timeline ────────────────────────────────────────────────

function AtAGlance({ rabbi }: { rabbi: Rabbi }) {
  const rows: { label: string; value: string }[] = [];
  if (rabbi.era) rows.push({ label: "תקופה", value: rabbi.era });
  if (rabbi.birthYear !== undefined)
    rows.push({ label: "נולד", value: [hebrewYearLabel(rabbi.birthYear), rabbi.birthPlace].filter(Boolean).join(" · ") });
  if (rabbi.deathYear !== undefined)
    rows.push({ label: "נפטר", value: [hebrewYearLabel(rabbi.deathYear), rabbi.deathPlace].filter(Boolean).join(" · ") });
  if (rabbi.works?.length) rows.push({ label: "חיבורים", value: String(rabbi.works.length) });
  const teachers = rabbi.lineage?.filter((l) => l.relation === "teacher").length ?? 0;
  const students = rabbi.lineage?.filter((l) => l.relation === "student").length ?? 0;
  if (teachers || students) rows.push({ label: "רבותיו / תלמידיו", value: `${teachers} / ${students}` });

  if (rows.length === 0) return null;

  return (
    <PageSection id="glance" icon={GraduationCap} tone="gold" title="במבט מהיר" delay={0.1}>
      <dl className="flex flex-col divide-y divide-hairline-card">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="text-muted">{row.label}</dt>
            <dd className="text-end text-foreground/85">{row.value}</dd>
          </div>
        ))}
      </dl>
    </PageSection>
  );
}

function TimelineSection({ rabbi }: { rabbi: Rabbi }) {
  return (
    <PageSection id="timeline" icon={MapPin} tone="learning" title="תחנות בחייו" delay={0.15}>
      <ol className="relative flex flex-col gap-4 border-s border-gold-line ps-5">
        {rabbi.locations!.map((location, i) => (
          <li key={`${location.place}-${i}`} className="relative">
            <span className="absolute -start-[1.6rem] top-1 size-2.5 rounded-full border-2 border-surface bg-gold" aria-hidden />
            <p className="text-sm font-medium text-foreground">{location.place}</p>
            {(location.fromYear || location.toYear) && (
              <p className="text-[0.7rem] tabular-nums text-muted">
                <span className="ltr">{[location.fromYear, location.toYear].filter(Boolean).join("–")}</span>
              </p>
            )}
            {location.note && <p className="mt-0.5 text-xs leading-relaxed text-muted">{location.note}</p>}
          </li>
        ))}
      </ol>
    </PageSection>
  );
}
