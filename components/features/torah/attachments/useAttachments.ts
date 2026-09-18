"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAudioActive, type AudioAttachmentView, type AudioEntityType } from "@/lib/torah/attachments/audio";
import { audioMimeType, MAX_AUDIO_BYTES } from "@/lib/torah/lessons/media";

const POLL_MS = 4000;

interface UploadInput {
  file: File | Blob;
  fileName: string;
  title?: string;
  durationSeconds?: number;
  source: "upload" | "recording";
  /** Start transcription as soon as the upload lands. */
  transcribe?: boolean;
}

/** PUTs the file to the signed upload URL with real progress events. */
function uploadWithProgress(url: string, blob: Blob, fileName: string, mimeType: string, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload network error"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new File([blob], fileName, { type: mimeType }));
    xhr.send(form);
  });
}

/**
 * The recordings attached to one entity.
 *
 * Polling is also what drives transcription forward while the page is open
 * (the GET route runs a worker step after responding), so it runs only while
 * something is actually transcribing — and pauses in a hidden tab, where a
 * throttled timer would otherwise leave a stale "מתמלל" on screen.
 */
export function useAttachments(entityType: AudioEntityType, entityId: string) {
  const [attachments, setAttachments] = useState<AudioAttachmentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "uploading" | "saving">(null);
  const [progress, setProgress] = useState(0);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(
        `/api/torah/attachments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "טעינת ההקלטות נכשלה.");
        setAttachments([]);
        return;
      }
      setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
      setError(null);
    } catch {
      setError("טעינת ההקלטות נכשלה. בדוק את החיבור.");
      setAttachments([]);
    } finally {
      inFlight.current = false;
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = (attachments ?? []).some((item) => isAudioActive(item.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, reload]);

  /** Registers the recording, uploads it straight to storage, then confirms. */
  const upload = useCallback(
    async (input: UploadInput): Promise<boolean> => {
      setError(null);
      const mimeType = audioMimeType(input.file.type, input.fileName);
      if (!mimeType) {
        setError("זה לא קובץ שמע נתמך. אפשר להעלות MP3, M4A, WAV, OGG או FLAC.");
        return false;
      }
      if (input.file.size > MAX_AUDIO_BYTES) {
        setError("הקובץ גדול מ-50MB. אפשר לדחוס אותו ל-MP3 באיכות 64kbps ולנסות שוב.");
        return false;
      }

      setBusy("uploading");
      setProgress(0);
      try {
        const created = await fetch("/api/torah/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType,
            entityId,
            fileName: input.fileName,
            mimeType,
            sizeBytes: input.file.size,
            durationSeconds: input.durationSeconds,
            title: input.title,
            source: input.source,
          }),
        });
        const data = await created.json();
        if (!created.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת ההקלטה נכשלה.");

        await uploadWithProgress(data.upload.url, input.file, input.fileName, data.upload.mimeType, setProgress);

        setBusy("saving");
        const confirmed = await fetch(`/api/torah/attachments/${data.attachment.id}/uploaded`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcribe: Boolean(input.transcribe) }),
        });
        const confirmedData = await confirmed.json();
        if (!confirmed.ok) {
          throw new Error(typeof confirmedData.error === "string" ? confirmedData.error : "אישור ההעלאה נכשל.");
        }
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ההעלאה נכשלה. נסה שוב.");
        return false;
      } finally {
        setBusy(null);
        setProgress(0);
      }
    },
    [entityType, entityId, reload]
  );

  const transcribe = useCallback(
    async (attachmentId: string) => {
      setError(null);
      // Optimistic: the request itself only flips the row and returns, and the
      // spinner should appear on the press, not a round trip later.
      setAttachments((prev) =>
        prev?.map((item) => (item.id === attachmentId ? { ...item, status: "transcribing", error: null } : item)) ?? prev
      );
      try {
        const response = await fetch(`/api/torah/attachments/${attachmentId}/transcribe`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "התמלול נכשל להתחיל.");
          await reload();
          return;
        }
        setAttachments((prev) => prev?.map((item) => (item.id === attachmentId ? data.attachment : item)) ?? prev);
      } catch {
        setError("התמלול נכשל להתחיל. נסה שוב.");
        await reload();
      }
    },
    [reload]
  );

  const rename = useCallback(async (attachmentId: string, title: string) => {
    setAttachments((prev) => prev?.map((item) => (item.id === attachmentId ? { ...item, title } : item)) ?? prev);
    await fetch(`/api/torah/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => undefined);
  }, []);

  const remove = useCallback(
    async (attachmentId: string) => {
      setAttachments((prev) => prev?.filter((item) => item.id !== attachmentId) ?? prev);
      const response = await fetch(`/api/torah/attachments/${attachmentId}`, { method: "DELETE" }).catch(() => null);
      if (!response?.ok) {
        setError("מחיקת ההקלטה נכשלה.");
        await reload();
      }
    },
    [reload]
  );

  return { attachments, error, busy, progress, active, reload, upload, transcribe, rename, remove, setError };
}
