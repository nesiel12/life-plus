import { describe, expect, it } from "vitest";
import { topicDigitalPath, topicDigitalUrl } from "@/lib/learning/topicQr";

const UUID = "3f2b8c1e-9a4d-4c6b-8e7f-1234567890ab";

describe("topicDigitalPath / topicDigitalUrl", () => {
  it("points at the topic's page in the Learning lab", () => {
    expect(topicDigitalPath(UUID)).toBe(`/areas/learning/topics/${UUID}`);
    expect(topicDigitalUrl("https://app.example.com", UUID)).toBe(`https://app.example.com/areas/learning/topics/${UUID}`);
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(topicDigitalUrl("https://app.example.com/", UUID)).toBe(`https://app.example.com/areas/learning/topics/${UUID}`);
  });

  it("refuses an id that could alter the URL rather than embedding it", () => {
    for (const id of ["", "../secret", "a/b", "a b", "id?x=1", "id#frag", "a".repeat(65), "נושא"]) {
      expect(topicDigitalPath(id), id).toBeNull();
      expect(topicDigitalUrl("https://x.test", id), id).toBeNull();
    }
  });
});
