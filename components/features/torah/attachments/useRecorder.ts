"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Recording a voice note in the browser.
//
// The container is whatever the browser actually supports — Chrome and Firefox
// give WebM/Opus, Safari gives MP4/AAC — and both are in the storage bucket's
// mime whitelist and readable by Gemini, so nothing is transcoded. Asking for a
// type the browser cannot produce is how a recorder silently yields a 0-byte
// blob, which is why the type is probed rather than assumed.

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** Longest single voice note: past this the file approaches the 50 MB ceiling. */
export const MAX_RECORDING_SECONDS = 90 * 60;

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds: number;
}

function supportedType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
    setPaused(false);
  }, []);

  // A recorder left running when the page navigates away keeps the microphone
  // light on — the one bug in this component a user would actually notice.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("הדפדפן הזה לא תומך בהקלטה. אפשר להעלות קובץ שמע במקום.");
      return false;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mimeType = supportedType();
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.start(1000);

      stream.current = media;
      recorder.current = instance;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        setSeconds((value) => {
          if (value + 1 >= MAX_RECORDING_SECONDS) instance.stop();
          return value + 1;
        });
      }, 1000);
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      setError(
        name === "NotAllowedError"
          ? "הגישה למיקרופון נחסמה. אפשר לאשר אותה בהגדרות הדפדפן, או להעלות קובץ שמע."
          : "לא הצלחנו לפתוח את המיקרופון. נסה שוב, או העלה קובץ שמע."
      );
      cleanup();
      return false;
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    if (recorder.current?.state === "recording") {
      recorder.current.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (recorder.current?.state === "paused") {
      recorder.current.resume();
      setPaused(false);
    }
  }, []);

  /** Stops and hands back the finished recording, or null if nothing was captured. */
  const stop = useCallback((): Promise<RecordingResult | null> => {
    const instance = recorder.current;
    if (!instance) return Promise.resolve(null);

    return new Promise((resolve) => {
      const duration = seconds;
      instance.onstop = () => {
        const mimeType = (instance.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type: mimeType });
        chunks.current = [];
        cleanup();
        resolve(
          blob.size > 0
            ? {
                blob,
                mimeType,
                fileName: `recording.${mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"}`,
                durationSeconds: duration,
              }
            : null
        );
      };
      if (instance.state === "inactive") instance.onstop?.(new Event("stop"));
      else instance.stop();
    });
  }, [cleanup, seconds]);

  const cancel = useCallback(() => {
    const instance = recorder.current;
    if (instance && instance.state !== "inactive") {
      instance.onstop = null;
      instance.stop();
    }
    chunks.current = [];
    cleanup();
    setSeconds(0);
  }, [cleanup]);

  return { recording, paused, seconds, error, start, stop, pause, resume, cancel, setError };
}
