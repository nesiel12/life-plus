import { describe, expect, it } from "vitest";
import { extractSentences } from "@/lib/voice/textToSpeech";

describe("extractSentences", () => {
  it("returns nothing complete for a buffer with no terminator yet", () => {
    const result = extractSentences("שלום, מה קורה היום");
    expect(result).toEqual({ complete: [], remainder: "שלום, מה קורה היום" });
  });

  it("extracts one complete sentence and keeps the rest as remainder", () => {
    const result = extractSentences("איך אתה מרגיש היום? ספר לי");
    expect(result).toEqual({ complete: ["איך אתה מרגיש היום?"], remainder: " ספר לי" });
  });

  it("extracts several complete sentences from one buffer", () => {
    const result = extractSentences("בוקר טוב! מה שלומך? הכל טוב.");
    expect(result.complete).toEqual(["בוקר טוב!", "מה שלומך?", "הכל טוב."]);
    expect(result.remainder).toBe("");
  });

  it("does not split a decimal number as a sentence end", () => {
    const result = extractSentences("זה עלה 3.5 שקלים בערך");
    expect(result.complete).toEqual([]);
    expect(result.remainder).toBe("זה עלה 3.5 שקלים בערך");
  });

  it("still splits a real sentence that happens to contain a decimal earlier", () => {
    const result = extractSentences("זה עלה 3.5 שקלים. תרצה לשמוע עוד");
    expect(result.complete).toEqual(["זה עלה 3.5 שקלים."]);
    expect(result.remainder).toBe(" תרצה לשמוע עוד");
  });

  it("round-trips across incremental calls the way a stream would feed it", () => {
    const chunks = ["איך ", "אתה ", "מרגיש", "? ", "טוב ", "מאוד", "."];
    let buffer = "";
    const spoken: string[] = [];
    for (const chunk of chunks) {
      buffer += chunk;
      const { complete, remainder } = extractSentences(buffer);
      spoken.push(...complete);
      buffer = remainder;
    }
    expect(spoken).toEqual(["איך אתה מרגיש?", "טוב מאוד."]);
    expect(buffer).toBe("");
  });
});
