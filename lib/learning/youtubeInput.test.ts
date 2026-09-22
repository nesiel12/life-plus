import { describe, expect, it } from "vitest";
import {
  findYoutubeUrl,
  formatClock,
  looksLikeUrl,
  parseVideoInput,
  parseYoutubeTimestamp,
} from "@/lib/learning/youtubeInput";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeTimestamp", () => {
  it.each([
    ["90", 90],
    ["1m30s", 90],
    ["1h2m3s", 3723],
    ["2h", 7200],
    ["45s", 45],
    ["2:05", 125],
    ["1:02:03", 3723],
    ["0", 0],
  ])("%s → %d seconds", (raw, expected) => {
    expect(parseYoutubeTimestamp(raw)).toBe(expected);
  });

  it("reads garbage as the start of the video", () => {
    for (const raw of ["", "abc", "1x", "-5", "1:2", "::", null, undefined, " "]) {
      expect(parseYoutubeTimestamp(raw as string), String(raw)).toBe(0);
    }
  });

  it("caps an absurd start rather than passing it to a player", () => {
    expect(parseYoutubeTimestamp("999999999")).toBeLessThan(24 * 3600);
  });
});

describe("parseVideoInput", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://m.youtube.com/watch?v=${ID}&feature=share`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
  ])("finds the video in %s", (input) => {
    expect(parseVideoInput(input)?.videoId).toBe(ID);
  });

  it("builds the preview and player URLs from the id", () => {
    const parsed = parseVideoInput(`https://youtu.be/${ID}`)!;
    expect(parsed.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(parsed.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(parsed.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(parsed.startSeconds).toBe(0);
  });

  it("carries a start time from ?t=, ?start= or #t=", () => {
    expect(parseVideoInput(`https://youtu.be/${ID}?t=90`)?.startSeconds).toBe(90);
    expect(parseVideoInput(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSeconds).toBe(90);
    expect(parseVideoInput(`https://www.youtube.com/watch?v=${ID}&start=15`)?.startSeconds).toBe(15);
    expect(parseVideoInput(`https://www.youtube.com/watch?v=${ID}#t=2m`)?.startSeconds).toBe(120);
    const parsed = parseVideoInput(`https://youtu.be/${ID}?t=90`)!;
    expect(parsed.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=90`);
    expect(parsed.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);
  });

  it("finds a link inside pasted text, and ignores the punctuation around it", () => {
    expect(parseVideoInput(`תראה את זה: https://youtu.be/${ID}.`)?.videoId).toBe(ID);
    expect(parseVideoInput(`(https://youtu.be/${ID})`)?.videoId).toBe(ID);
    expect(parseVideoInput(`  https://youtu.be/${ID}  `)?.videoId).toBe(ID);
  });

  it("never mistakes a word for a video id", () => {
    // Each of these is exactly 11 characters of [\w-] — a valid *id* shape.
    for (const word of ["programming", "photography", "mathematics", "engineering", ID, "hello-world"]) {
      expect(word).toHaveLength(11);
      expect(parseVideoInput(word), word).toBeNull();
    }
  });

  it("ignores everything that is not a YouTube link", () => {
    for (const input of [
      "",
      "   ",
      "פיזיקה קוונטית",
      "https://example.com/watch?v=" + ID,
      "https://vimeo.com/123456789",
      `https://youtube.com.evil.test/watch?v=${ID}`,
      "https://www.youtube.com/",
      "https://www.youtube.com/watch?v=short",
    ]) {
      expect(parseVideoInput(input), input).toBeNull();
    }
  });

  it("does not accept a look-alike domain that merely ends in youtube.com or youtu.be", () => {
    expect(parseVideoInput(`https://notyoutube.com/watch?v=${ID}`)).toBeNull();
    expect(parseVideoInput(`notyoutube.com/watch?v=${ID}`)).toBeNull();
    expect(parseVideoInput(`https://evilyoutu.be/${ID}`)).toBeNull();
    expect(parseVideoInput(`evilyoutu.be/${ID}`)).toBeNull();
    expect(findYoutubeUrl(`see fakeyoutube.com/watch?v=${ID}`)).toBeNull();
  });

  it("still finds a real link that follows a look-alike one", () => {
    expect(parseVideoInput(`notyoutube.com/x https://youtu.be/${ID}`)?.videoId).toBe(ID);
  });
});

describe("looksLikeUrl", () => {
  it("recognises a link before it is complete enough to parse", () => {
    expect(looksLikeUrl("https://youtu.be/abc")).toBe(true);
    expect(looksLikeUrl("www.youtube.com/watch")).toBe(true);
    expect(looksLikeUrl("פיזיקה")).toBe(false);
    expect(looksLikeUrl("two words")).toBe(false);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [65, "1:05"],
    [3599, "59:59"],
    [3723, "1:02:03"],
  ])("%d → %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});
