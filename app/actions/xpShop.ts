"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { learningPurchasesRepo } from "@/lib/db/learningPurchases";
import { learningActiveCosmeticsRepo } from "@/lib/db/learningActiveCosmetics";
import { streakShieldConsumptionsRepo } from "@/lib/db/streakShieldConsumptions";
import { toLearningResource, toLearningTopic } from "@/lib/mappers";
import { labStats } from "@/lib/learning/xp";
import { SHOP_ITEMS, availableXp, canAfford, ownedItemIds, shieldInventory, shopItemById, type PurchaseRecord } from "@/lib/learning/xpShop";

export interface ShopState {
  items: typeof SHOP_ITEMS;
  earnedXp: number;
  availableXp: number;
  ownedItemIds: string[];
  shieldCount: number;
  activeTheme: string | null;
  activeParticleTrail: string | null;
}

async function loadPurchases(userId: string): Promise<PurchaseRecord[]> {
  const rows = await learningPurchasesRepo.list(userId);
  return rows.map((row) => ({ itemId: row.item_id, costXp: row.cost_xp }));
}

async function loadEarnedXp(userId: string): Promise<number> {
  const [topicRows, resourceRows] = await Promise.all([learningTopicsRepo.list(userId), learningResourcesRepo.list(userId)]);
  const stats = labStats(topicRows.map(toLearningTopic), resourceRows.map(toLearningResource));
  return stats.xp;
}

/** Everything the shop modal needs in one call — never trust a client-held balance, this is always recomputed from the ledger. */
export async function getShopStateAction(): Promise<ShopState> {
  const userId = await getCurrentUserId();
  const [earnedXp, purchases, cosmetics, consumedDates] = await Promise.all([
    loadEarnedXp(userId),
    loadPurchases(userId),
    learningActiveCosmeticsRepo.get(userId),
    streakShieldConsumptionsRepo.listDates(userId),
  ]);

  return {
    items: SHOP_ITEMS,
    earnedXp,
    availableXp: availableXp(earnedXp, purchases),
    ownedItemIds: [...ownedItemIds(purchases)],
    shieldCount: shieldInventory(purchases, consumedDates.length),
    activeTheme: cosmetics?.active_theme ?? null,
    activeParticleTrail: cosmetics?.active_particle_trail ?? null,
  };
}

/**
 * Buys one item. Re-validates affordability against a freshly computed
 * balance server-side — a client-side "can I afford this" check is only
 * ever a UI convenience, never trusted for the actual write, the same
 * reason every other write in this app re-derives what it needs instead
 * of taking the caller's word for it.
 */
export async function purchaseItemAction(itemId: string): Promise<ShopState> {
  const userId = await getCurrentUserId();
  const item = shopItemById(itemId);
  if (!item) throw new Error("פריט לא נמצא בחנות");

  const earnedXp = await loadEarnedXp(userId);
  const purchases = await loadPurchases(userId);
  const balance = availableXp(earnedXp, purchases);
  if (!canAfford(balance, item.cost)) throw new Error("אין מספיק XP לרכישה הזו");

  await learningPurchasesRepo.insert({ user_id: userId, item_id: item.id, cost_xp: item.cost });
  return getShopStateAction();
}

/** Themes/trails only ever wear one at a time — equipping a new one silently replaces whichever was active, same as any "pick one" cosmetic slot. */
export async function setActiveThemeAction(themeId: string | null): Promise<void> {
  const userId = await getCurrentUserId();
  if (themeId !== null) {
    const owned = ownedItemIds(await loadPurchases(userId));
    if (!owned.has(themeId)) throw new Error("הפריט הזה לא נרכש עדיין");
  }
  await learningActiveCosmeticsRepo.setActiveTheme(userId, themeId);
}

export async function setActiveParticleTrailAction(trailId: string | null): Promise<void> {
  const userId = await getCurrentUserId();
  if (trailId !== null) {
    const owned = ownedItemIds(await loadPurchases(userId));
    if (!owned.has(trailId)) throw new Error("הפריט הזה לא נרכש עדיין");
  }
  await learningActiveCosmeticsRepo.setActiveParticleTrail(userId, trailId);
}
