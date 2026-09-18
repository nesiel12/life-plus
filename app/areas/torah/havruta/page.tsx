"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const SUBJECTS = new Set(["book", "rabbi", "lesson", "concept", "summary"]);
const MODES = new Set(["debate", "clarify"]);

// /areas/torah/havruta?type=rabbi&id=…&mode=debate — opens (or reopens) the
// Havruta on any subject and lands in its discussion page. Used by the
// knowledge map's inspector, which knows a node but not a thread.
export default function OpenHavrutaRoute() {
  return (
    <Suspense fallback={null}>
      <OpenHavruta />
    </Suspense>
  );
}

function OpenHavruta() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const type = params.get("type") ?? "";
    const id = params.get("id") ?? "";
    const mode = params.get("mode") ?? "debate";
    if (!SUBJECTS.has(type) || !id) {
      setError("חסר נושא לדיון.");
      return;
    }
    fetch("/api/torah/havruta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectType: type, subjectId: id, mode: MODES.has(mode) ? mode : "debate" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.thread?.id) router.replace(`/areas/torah/havruta/${data.thread.id}`);
        else setError(typeof data?.error === "string" ? data.error : "לא הצלחנו לפתוח את החברותא.");
      })
      .catch(() => setError("לא הצלחנו לפתוח את החברותא."));
  }, [params, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      {error ? (
        <p className="text-sm text-accent-family">{error}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          פותח את החברותא…
        </p>
      )}
    </main>
  );
}
