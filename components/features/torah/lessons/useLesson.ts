"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LessonDetail } from "@/lib/torah/lessons/types";

const ACTIVE = new Set(["uploading", "pending", "transcribing", "analyzing"]);
const POLL_MS = 4000;

/**
 * Loads a lesson and keeps it fresh while it is processing.
 *
 * Each poll is also what drives processing forward while the page is open
 * (the GET route runs a pipeline step after responding), so polling stops the
 * moment the lesson is ready or failed — there is nothing left to drive.
 */
export function useLesson(lessonId: string) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/torah/lessons/${lessonId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "טעינת השיעור נכשלה.");
        return;
      }
      setLesson(data.lesson);
      setError(null);
    } catch {
      setError("טעינת השיעור נכשלה. בדוק את החיבור.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = lesson ? ACTIVE.has(lesson.status) : false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, POLL_MS);
    // A backgrounded tab skips polls (and browsers throttle its timers), so
    // coming back to the tab refreshes at once instead of showing a stale
    // "processing" state for up to a poll interval — or longer.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, reload]);

  return { lesson, setLesson, error, loading, reload, active };
}
