import { describe, expect, it } from "vitest";
import { SHOP_ITEMS, availableXp, canAfford, ownedItemIds, shieldInventory, shopItemById } from "@/lib/learning/xpShop";

describe("SHOP_ITEMS", () => {
  it("every item has a positive cost and a unique id", () => {
    const ids = new Set<string>();
    for (const item of SHOP_ITEMS) {
      expect(item.cost).toBeGreaterThan(0);
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
  });
});

describe("shopItemById", () => {
  it("finds a known item", () => {
    expect(shopItemById("streak_shield")?.category).toBe("shield");
  });

  it("returns undefined for an unknown id", () => {
    expect(shopItemById("does_not_exist")).toBeUndefined();
  });
});

describe("availableXp", () => {
  it("is earned XP when nothing was bought", () => {
    expect(availableXp(500, [])).toBe(500);
  });

  it("subtracts every purchase", () => {
    expect(availableXp(500, [{ itemId: "a", costXp: 100 }, { itemId: "b", costXp: 50 }])).toBe(350);
  });

  it("never goes negative even if purchases somehow exceed earned XP", () => {
    expect(availableXp(50, [{ itemId: "a", costXp: 100 }])).toBe(0);
  });
});

describe("canAfford", () => {
  it("true when available XP covers the cost exactly", () => {
    expect(canAfford(100, 100)).toBe(true);
  });

  it("false when short by any amount", () => {
    expect(canAfford(99, 100)).toBe(false);
  });
});

describe("ownedItemIds", () => {
  it("collects unique ids, even with duplicate purchases (a stackable item)", () => {
    const owned = ownedItemIds([{ itemId: "streak_shield", costXp: 100 }, { itemId: "streak_shield", costXp: 100 }, { itemId: "theme_cyberpunk", costXp: 400 }]);
    expect(owned).toEqual(new Set(["streak_shield", "theme_cyberpunk"]));
  });
});

describe("shieldInventory", () => {
  it("is purchased shields minus consumed ones", () => {
    const purchases = [{ itemId: "streak_shield", costXp: 100 }, { itemId: "streak_shield", costXp: 100 }, { itemId: "theme_cyberpunk", costXp: 400 }];
    expect(shieldInventory(purchases, 1)).toBe(1);
  });

  it("never goes negative", () => {
    const purchases = [{ itemId: "streak_shield", costXp: 100 }];
    expect(shieldInventory(purchases, 5)).toBe(0);
  });
});
