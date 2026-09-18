"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, GraduationCap, Loader2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { BackToHome } from "@/components/layout/BackToHome";

// /areas/torah/open?type=book&title=…            — a sefer by name
// /areas/torah/open?type=rabbi&name=…&slug=…     — a rabbi by name / Sefaria slug
//
// The resolver behind every "open or create" link that is a real URL rather
// than a button: an auto-linked book name inside a note, a link opened in a
// new tab. It finds the row (or creates it) and replaces itself with the real
// page, so the back button skips straight past it.
export default function TorahOpenPage() {
  return (
    <Suspense fallback={null}>
      <Resolver />
    </Suspense>
  );
}

function Resolver() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useAtlasStore((s) => s.hydrated);
  const openOrCreateBook = useAtlasStore((s) => s.openOrCreateBook);
  const openOrCreateRabbi = useAtlasStore((s) => s.openOrCreateRabbi);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const type = params.get("type");
  const label = (type === "rabbi" ? params.get("name") : params.get("title"))?.trim() ?? "";

  useEffect(() => {
    // Wait for the store, so an existing row is matched rather than a
    // duplicate created; and run once, since React may re-run effects.
    if (!hydrated || started.current) return;
    started.current = true;

    if (!label || (type !== "book" && type !== "rabbi")) {
      setError("הקישור אינו שלם.");
      return;
    }

    const run =
      type === "book"
        ? openOrCreateBook({ title: label, sefariaTitle: params.get("sefaria") ?? undefined }).then(
            (book) => `/areas/torah/books/${book.id}`
          )
        : openOrCreateRabbi({ name: label, sefariaSlug: params.get("slug") ?? undefined }).then(
            (rabbi) => `/areas/torah/rabbis/${rabbi.id}`
          );

    run.then((href) => router.replace(href)).catch(() => setError("הפתיחה נכשלה. נסה שוב."));
  }, [hydrated, label, type, params, openOrCreateBook, openOrCreateRabbi, router]);

  const Icon = type === "rabbi" ? GraduationCap : BookOpen;

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-gold-soft text-gold-ink">
          <Icon size={28} aria-hidden />
        </span>
        {error ? (
          <p className="text-sm text-accent-family">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 size={15} className="animate-spin" aria-hidden />
            {type === "rabbi" ? `פותח את הדף של ${label}…` : `פותח את «${label}»…`}
          </p>
        )}
      </div>
    </main>
  );
}
