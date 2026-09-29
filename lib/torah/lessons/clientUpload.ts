"use client";

// Shared by LessonUploader.tsx (a new audio lesson) and LessonProcessing.tsx
// (the manual "upload audio" fallback for a youtube lesson Gemini couldn't
// reach) — both PUT a file straight to a signed Supabase upload URL, never
// through a serverless function's body limit.

/** Reads a local audio file's duration from its own metadata, without uploading it. */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined);
    audio.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 8000);
    audio.src = url;
  });
}

/** PUTs the file to the signed upload URL with real progress events. */
export function uploadWithProgress(url: string, file: File, mimeType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
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
    form.append("", new File([file], file.name, { type: mimeType }));
    xhr.send(form);
  });
}
