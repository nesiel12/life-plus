"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Voice input through the browser's own speech recognition, in Hebrew.
//
// Browser-side on purpose: dictating a meal is a few seconds of speech, the
// Web Speech API does it for free with no upload, and the only thing the app
// needs back is text — which then goes through the same AI estimate as typing.
// Where the API does not exist (Firefox), `supported` is false and the mic
// button is simply not shown.

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const instance = new Ctor();
    instance.lang = "he-IL";
    instance.interimResults = true;
    instance.continuous = false;
    let finalText = "";
    instance.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      handler.current((finalText + interim).trim());
    };
    instance.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "הגישה למיקרופון נחסמה. אפשר להקליד במקום."
          : event.error === "no-speech"
            ? "לא נשמע דיבור. נסה שוב."
            : "הזיהוי הקולי נכשל. אפשר להקליד במקום."
      );
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setListening(true);
    try {
      instance.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
