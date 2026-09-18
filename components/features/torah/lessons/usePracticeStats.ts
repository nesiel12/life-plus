"use client";

import { useCallback, useEffect, useState } from "react";
import type { PracticeStats } from "@/lib/torah/practiceStats";

/** XP, level, streak and mastery from /api/torah/practice/stats, in the user's own time zone. */
export function usePracticeStats(lessonId?: string) {
  const [stats, setStats] = useState<PracticeStats | null>(null);

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (lessonId) params.set("lessonId", lessonId);
    try {
      const response = await fetch(`/api/torah/practice/stats?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setStats(data.stats);
    } catch {
      // Stats are decoration on practice; practice works without them.
    }
  }, [lessonId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stats, reload };
}
