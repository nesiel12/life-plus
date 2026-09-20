import { describe, expect, it } from "vitest";
import { MAC_LAUNCH, launchOrigin, macBackdropVariants, macLaunchTransition, macLaunchVariants } from "@/lib/motion/macLaunch";

/** A cubic-bezier's y at parameter t — enough to prove the curve never overshoots. */
function bezierY(t: number, [, y1, , y2]: readonly number[]) {
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

describe("the macOS launch spec", () => {
  it("starts inside the 94–96% scale band, subtly transparent", () => {
    expect(MAC_LAUNCH.fromScale).toBeGreaterThanOrEqual(0.94);
    expect(MAC_LAUNCH.fromScale).toBeLessThanOrEqual(0.96);
    const variants = macLaunchVariants();
    expect(variants.hidden).toMatchObject({ opacity: 0, scale: MAC_LAUNCH.fromScale });
    expect(variants.visible).toMatchObject({ opacity: 1, scale: 1 });
  });

  it("runs 250–350ms", () => {
    expect(MAC_LAUNCH.durationMs).toBeGreaterThanOrEqual(250);
    expect(MAC_LAUNCH.durationMs).toBeLessThanOrEqual(350);
    const opacity = (macLaunchTransition as { opacity: { duration: number } }).opacity;
    const scale = (macLaunchTransition as { scale: { visualDuration: number } }).scale;
    expect(opacity.duration).toBeCloseTo(MAC_LAUNCH.durationMs / 1000);
    expect(scale.visualDuration).toBeCloseTo(MAC_LAUNCH.durationMs / 1000);
  });

  it("eases OUT: most of the motion happens early", () => {
    expect(bezierY(0.3, MAC_LAUNCH.ease)).toBeGreaterThan(0.6);
  });

  it("never overshoots on the tween, and the spring settle is not a bounce", () => {
    for (let t = 0; t <= 1; t += 0.02) expect(bezierY(t, MAC_LAUNCH.ease)).toBeLessThanOrEqual(1.0000001);
    expect(MAC_LAUNCH.bounce).toBeGreaterThan(0);
    expect(MAC_LAUNCH.bounce).toBeLessThanOrEqual(0.1);
  });

  it("animates only compositor properties — nothing that can reflow layout", () => {
    const allowed = new Set(["opacity", "scale", "transition"]);
    for (const variant of Object.values(macLaunchVariants())) {
      for (const key of Object.keys(variant as object)) expect(allowed.has(key)).toBe(true);
    }
  });

  it("closes faster than it opens, and less dramatically", () => {
    expect(MAC_LAUNCH.exitDurationMs).toBeLessThan(MAC_LAUNCH.durationMs);
    expect(MAC_LAUNCH.exitScale).toBeGreaterThan(MAC_LAUNCH.fromScale);
  });

  it("drops the scale entirely under reduced motion", () => {
    const reduced = macLaunchVariants(true);
    expect(reduced.hidden).toEqual({ opacity: 0 });
    expect(Object.keys(reduced.visible as object)).not.toContain("scale");
  });

  it("fades the backdrop on the same clock", () => {
    const visible = macBackdropVariants().visible as { transition: { duration: number } };
    expect(visible.transition.duration).toBeCloseTo(MAC_LAUNCH.durationMs / 1000);
  });
});

describe("launchOrigin", () => {
  const viewport = { width: 1200, height: 800 };
  const panel = { width: 400, height: 400 };

  it("is the panel's own center when launched from the viewport center", () => {
    expect(launchOrigin({ left: 590, top: 390, width: 20, height: 20 }, panel, viewport)).toBe("200px 200px");
  });

  it("points toward a launcher off to the side", () => {
    // A bell near the bottom-right corner: origin lands past the panel's end.
    expect(launchOrigin({ left: 900, top: 650, width: 36, height: 36 }, panel, viewport)).toBe("500px 468px");
  });

  it("is clamped, so a far launcher suggests a direction instead of a fly-in", () => {
    expect(launchOrigin({ left: 5000, top: -5000, width: 10, height: 10 }, panel, viewport)).toBe("500px -100px");
  });
});
