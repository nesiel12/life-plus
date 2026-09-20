"use client";

// The YouTube IFrame API, loaded once per page and shared by every player in
// the app (the Torah lesson player and the interactive video lesson). One
// loader, because the API announces itself through a single global callback —
// two independent loaders would overwrite each other's.

export interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: { onStateChange?: (event: { data: number }) => void; onReady?: () => void; onError?: (event: { data: number }) => void };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApi: Promise<YTNamespace> | null = null;

export function loadYoutubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApi) return youtubeApi;
  youtubeApi = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeApi = null;
      reject(new Error("YouTube player failed to load"));
    };
    document.head.appendChild(script);
  });
  return youtubeApi;
}

export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_ENDED = 0;
