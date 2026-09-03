import { describe, expect, it } from "vitest";
import {
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
} from "@/lib/learning/youtube";

const ID = "dQw4w9WgXcQ";

describe("youtubeVideoId", () => {
  it("accepts a bare id", () => {
    expect(youtubeVideoId(ID)).toBe(ID);
  });

  it("handles every common URL shape", () => {
    const urls = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=42`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
    ];
    for (const url of urls) {
      expect(youtubeVideoId(url), url).toBe(ID);
    }
  });

  it("trims surrounding whitespace", () => {
    expect(youtubeVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("rejects non-YouTube hosts, including lookalikes", () => {
    const bad = [
      "https://vimeo.com/123456",
      "https://notyoutube.com/watch?v=" + ID,
      "https://youtube.com.evil.test/watch?v=" + ID,
      "https://example.com/embed/" + ID,
    ];
    for (const url of bad) {
      expect(youtubeVideoId(url), url).toBeNull();
    }
  });

  it("rejects malformed input and ids of the wrong length", () => {
    for (const bad of ["", "   ", "not a url", "https://youtu.be/short", `https://www.youtube.com/watch?v=${ID}X`]) {
      expect(youtubeVideoId(bad), bad).toBeNull();
    }
  });
});

describe("url builders", () => {
  it("embeds via the no-cookie host", () => {
    expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
  });

  it("builds a thumbnail url", () => {
    expect(youtubeThumbnailUrl(ID)).toContain(ID);
  });
});
