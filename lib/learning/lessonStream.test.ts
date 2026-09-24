import { describe, expect, it } from "vitest";
import { lessonStreamProgress } from "./lessonStream";

describe("lessonStreamProgress", () => {
  it("is all pending before anything arrives", () => {
    expect(lessonStreamProgress(undefined).every((s) => s.state === "pending")).toBe(true);
  });
  it("marks earlier sections done and the latest one writing", () => {
    const states = lessonStreamProgress({ originStory: "x", pioneers: [], coreContent: "partial" }).map((s) => s.state);
    expect(states).toEqual(["done", "done", "writing", "pending", "pending", "pending"]);
  });
});
