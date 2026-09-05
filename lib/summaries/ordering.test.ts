import { describe, expect, it } from "vitest";
import { ORDER_STEP, isFirst, isLast, moveBy, nextOrder, reorder, sorted } from "@/lib/summaries/ordering";

const item = (id: string, sortOrder: number) => ({ id, sortOrder });
// a=100, b=200, c=300, d=400
const LIST = [item("c", 300), item("a", 100), item("d", 400), item("b", 200)];

function applied(items: { id: string; sortOrder: number }[], changes: { id: string; sortOrder: number }[]) {
  const byId = new Map(changes.map((c) => [c.id, c.sortOrder]));
  return sorted(items.map((i) => ({ ...i, sortOrder: byId.get(i.id) ?? i.sortOrder }))).map((i) => i.id);
}

describe("sorted", () => {
  it("orders ascending by sortOrder", () => {
    expect(sorted(LIST).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("breaks ties stably by id", () => {
    expect(sorted([item("b", 1), item("a", 1)]).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const input = [item("b", 2), item("a", 1)];
    sorted(input);
    expect(input[0].id).toBe("b");
  });
});

describe("nextOrder", () => {
  it("starts at one step for an empty list", () => {
    expect(nextOrder([])).toBe(ORDER_STEP);
  });

  it("appends a step past the current maximum", () => {
    expect(nextOrder(LIST)).toBe(500);
  });

  it("uses the maximum, not the count, so gaps do not collide", () => {
    expect(nextOrder([item("a", 5000)])).toBe(5100);
  });
});

describe("reorder", () => {
  it("moves an item up", () => {
    // c (index 2) to the front.
    expect(applied(LIST, reorder(LIST, "c", 0))).toEqual(["c", "a", "b", "d"]);
  });

  // The classic off-by-one: splicing the item out first shifts every later
  // index, landing a downward move one slot short.
  it("moves an item down to the exact requested position", () => {
    // a (index 0) to index 2 -> b, c, a, d
    expect(applied(LIST, reorder(LIST, "a", 2))).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item to the very end", () => {
    expect(applied(LIST, reorder(LIST, "a", 3))).toEqual(["b", "c", "d", "a"]);
  });

  it("returns no changes when the item is already at that position", () => {
    expect(reorder(LIST, "a", 0)).toEqual([]);
  });

  it("clamps a drop past the end rather than throwing", () => {
    expect(applied(LIST, reorder(LIST, "a", 99))).toEqual(["b", "c", "d", "a"]);
  });

  it("clamps a negative index", () => {
    expect(applied(LIST, reorder(LIST, "d", -5))).toEqual(["d", "a", "b", "c"]);
  });

  it("returns nothing for an unknown id", () => {
    expect(reorder(LIST, "missing", 0)).toEqual([]);
  });

  it("handles a single-item list", () => {
    expect(reorder([item("a", 100)], "a", 0)).toEqual([]);
  });

  it("returns only rows whose order actually changed", () => {
    const changes = reorder(LIST, "d", 3); // already last
    expect(changes).toEqual([]);
  });

  it("produces evenly spaced orders after a move", () => {
    const changes = reorder(LIST, "c", 0);
    const values = changes.map((c) => c.sortOrder).sort((a, b) => a - b);
    for (const v of values) expect(v % ORDER_STEP).toBe(0);
  });

  it("survives repeated moves without collapsing spacing", () => {
    let list = [...LIST];
    for (const [id, to] of [["a", 3], ["d", 0], ["b", 2], ["c", 1]] as const) {
      const changes = reorder(list, id, to);
      const byId = new Map(changes.map((c) => [c.id, c.sortOrder]));
      list = list.map((i) => ({ ...i, sortOrder: byId.get(i.id) ?? i.sortOrder }));
    }
    const orders = sorted(list).map((i) => i.sortOrder);
    expect(new Set(orders).size).toBe(orders.length); // no duplicates
  });
});

describe("moveBy", () => {
  it("moves one step down", () => {
    expect(applied(LIST, moveBy(LIST, "a", 1))).toEqual(["b", "a", "c", "d"]);
  });

  it("moves one step up", () => {
    expect(applied(LIST, moveBy(LIST, "c", -1))).toEqual(["a", "c", "b", "d"]);
  });

  it("is a no-op past either edge", () => {
    expect(moveBy(LIST, "a", -1)).toEqual([]);
    expect(moveBy(LIST, "d", 1)).toEqual([]);
  });
});

describe("isFirst / isLast", () => {
  it("identifies the edges", () => {
    expect(isFirst(LIST, "a")).toBe(true);
    expect(isFirst(LIST, "b")).toBe(false);
    expect(isLast(LIST, "d")).toBe(true);
    expect(isLast(LIST, "c")).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(isFirst([], "a")).toBe(false);
    expect(isLast([], "a")).toBe(false);
  });

  it("treats a single item as both first and last", () => {
    const one = [item("a", 1)];
    expect(isFirst(one, "a")).toBe(true);
    expect(isLast(one, "a")).toBe(true);
  });
});
