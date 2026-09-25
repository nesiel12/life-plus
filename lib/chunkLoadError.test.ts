import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkLoadError";

describe("isChunkLoadError", () => {
  it("recognizes Chrome/Edge's ChunkLoadError by name", () => {
    const err = Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" });
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("recognizes Firefox's phrasing", () => {
    expect(isChunkLoadError(new Error("error loading dynamically imported module: https://…"))).toBe(true);
  });

  it("recognizes Safari's phrasing", () => {
    expect(isChunkLoadError(new TypeError("Importing a module script failed"))).toBe(true);
  });

  it("recognizes the exact live report's wording", () => {
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/components_features_learning_step_ConceptGraph_tsx.js"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isChunkLoadError(new Error("FAILED TO LOAD CHUNK"))).toBe(true);
  });

  it("does not misclassify an ordinary render error", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(new TypeError("fetch failed"))).toBe(false);
  });
});
