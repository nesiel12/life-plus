"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}
interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface UseVoiceInputResult {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
}

// Progressive enhancement only (AI Command Panel, docs/ATLAS_ARCHITECTURE_
// VISION.md §12): the Web Speech API's SpeechRecognition is Chrome/Edge-
// only today (no Firefox/Safari support) and needs a real microphone this
// environment can't test against — feature-detected so the mic button
// simply doesn't render anywhere it isn't available, never a broken
// control. Hebrew locale (he-IL); a recognized phrase is appended to
// whatever text is already in the input, never auto-sent — the same
// "never act without an explicit user action" rule every command in this
// panel already follows.
export function useVoiceInput(onResult: (transcript: string) => void): UseVoiceInputResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const { SpeechRecognition, webkitSpeechRecognition } = window as unknown as SpeechWindow;
    const Recognition = SpeechRecognition ?? webkitSpeechRecognition;
    if (!Recognition) return;

    setSupported(true);
    const recognition = new Recognition();
    recognition.lang = "he-IL";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1][0];
      onResult(lastResult.transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;

    return () => recognition.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setListening(true);
    recognitionRef.current.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}
