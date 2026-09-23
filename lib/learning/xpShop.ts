// The Life Plus XP Shop's catalog and spending arithmetic.
//
// Same rule as lib/learning/xp.ts and masterclassXp.ts: nothing here stores
// a balance. Available XP is earned (labStats, computed from completion
// history, unchanged) minus the sum of every row in learning_purchases —
// an append-only ledger, never a counter that could drift from it.

export type ShopItemCategory = "theme" | "badge" | "trail" | "shield";

export interface ShopItem {
  id: string;
  category: ShopItemCategory;
  /** Hebrew, RTL. */
  name: string;
  cost: number;
  /** Themes/trails have exactly one of these each equipped at a time (learning_active_cosmetics); badges and shields don't. */
  equippable: boolean;
}

// Prices aren't specified anywhere the feature was requested from — chosen
// to sit comfortably inside the XP range an engaged learner already earns
// (lib/learning/xp.ts: 10-50 XP per resource, +100 per finished topic), so
// a themed reskin or a shield reads as a real, occasional reward rather
// than either trivial or unreachable.
export const SHOP_ITEMS: ShopItem[] = [
  { id: "theme_cyberpunk", category: "theme", name: "סייברפאנק", cost: 400, equippable: true },
  { id: "theme_royal_gold", category: "theme", name: "זהב מלכותי", cost: 400, equippable: true },
  { id: "theme_retro_parchment", category: "theme", name: "קלף עתיק", cost: 350, equippable: true },
  { id: "theme_neon_dark", category: "theme", name: "ניאון אפל", cost: 400, equippable: true },

  { id: "badge_python_alchemist", category: "badge", name: "אלכימאי פייתון", cost: 150, equippable: false },
  { id: "badge_history_explorer", category: "badge", name: "חוקר היסטוריה", cost: 150, equippable: false },
  { id: "badge_code_master", category: "badge", name: "אמן קוד", cost: 200, equippable: false },

  { id: "trail_fire", category: "trail", name: "שביל אש", cost: 250, equippable: true },
  { id: "trail_gold_dust", category: "trail", name: "אבק זהב", cost: 250, equippable: true },
  { id: "trail_neon_sparkles", category: "trail", name: "ניצוצות ניאון", cost: 250, equippable: true },
  { id: "trail_starfall", category: "trail", name: "מפולת כוכבים", cost: 300, equippable: true },

  { id: "streak_shield", category: "shield", name: "מגן רצף", cost: 100, equippable: false },
];

const SHOP_ITEMS_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

export function shopItemById(itemId: string): ShopItem | undefined {
  return SHOP_ITEMS_BY_ID.get(itemId);
}

export interface PurchaseRecord {
  itemId: string;
  costXp: number;
}

/** What's actually left to spend: earned XP (unchanged, derived elsewhere) minus everything ever bought. */
export function availableXp(earnedXp: number, purchases: readonly PurchaseRecord[]): number {
  const spent = purchases.reduce((sum, p) => sum + p.costXp, 0);
  return Math.max(0, earnedXp - spent);
}

export function canAfford(currentAvailableXp: number, cost: number): boolean {
  return currentAvailableXp >= cost;
}

/** Item ids the person owns at least one purchase of — a Set, since owning is binary even for a stackable item like the shield (see shieldInventory for the count). */
export function ownedItemIds(purchases: readonly PurchaseRecord[]): Set<string> {
  return new Set(purchases.map((p) => p.itemId));
}

/** How many Streak Shields are unspent: purchased minus consumed (learning_streak_shield_consumptions rows). */
export function shieldInventory(purchases: readonly PurchaseRecord[], consumedCount: number): number {
  const purchased = purchases.filter((p) => p.itemId === "streak_shield").length;
  return Math.max(0, purchased - consumedCount);
}
