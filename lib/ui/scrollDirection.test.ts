import { describe, expect, it } from "vitest";
import { nextScrollDirection } from "./scrollDirection";

const page = (y: number) => ({ y, viewportHeight: 800, documentHeight: 5000 });

describe("nextScrollDirection", () => {
  it("hides on a real downward scroll and shows again on an upward one", () => {
    let step = nextScrollDirection("up", 200, page(260));
    expect(step.direction).toBe("down");
    step = nextScrollDirection(step.direction, step.anchorY, page(230));
    expect(step.direction).toBe("up");
  });

  it("ignores jitter below the threshold, without resetting where it measures from", () => {
    const first = nextScrollDirection("up", 300, page(305));
    expect(first).toEqual({ direction: "up", anchorY: 300 });
    // Slow scrolling still adds up past the threshold from the same anchor.
    expect(nextScrollDirection(first.direction, first.anchorY, page(312)).direction).toBe("down");
  });

  it("always shows the nav near the top of the page, whatever the last direction was", () => {
    expect(nextScrollDirection("down", 400, page(40)).direction).toBe("up");
  });

  it("treats iOS rubber-band overscroll (negative scrollY) as the top", () => {
    expect(nextScrollDirection("down", 0, page(-30))).toEqual({ direction: "up", anchorY: 0 });
  });

  it("shows the nav again at the very bottom, where there is nowhere further to scroll", () => {
    expect(nextScrollDirection("down", 4100, page(4200)).direction).toBe("up");
  });
});
