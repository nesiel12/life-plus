"use client";

import { useEffect, useState } from "react";
import { Check, Palette, Shield, Sparkles, Tag, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useActiveSkin } from "@/components/providers/ActiveSkinProvider";
import { getShopStateAction, purchaseItemAction, setActiveParticleTrailAction, type ShopState } from "@/app/actions/xpShop";
import { SHOP_ITEMS, type ShopItem, type ShopItemCategory } from "@/lib/learning/xpShop";
import { cn } from "@/lib/utils";

interface LifePlusShopModalProps {
  onClose: () => void;
  /** Lets the caller (LearningHub) equip the active particle trail immediately, without a full state re-fetch. */
  onActiveTrailChange: (trailId: string | null) => void;
}

const CATEGORY_LABEL: Record<ShopItemCategory, string> = {
  theme: "ערכות נושא",
  badge: "תגי פרופיל",
  trail: "שבילי חלקיקים",
  shield: "מגן רצף",
};
const CATEGORY_ICON: Record<ShopItemCategory, typeof Palette> = {
  theme: Palette,
  badge: Tag,
  trail: Sparkles,
  shield: Shield,
};

/**
 * The Life Plus XP Shop — spends from the purchase ledger
 * (learning_purchases), never a stored balance: every render here reflects
 * a fresh getShopStateAction() call, and a purchase re-fetches rather than
 * locally decrementing a guessed number.
 */
export function LifePlusShopModal({ onClose, onActiveTrailChange }: LifePlusShopModalProps) {
  const { skin, setSkin } = useActiveSkin();
  const [state, setState] = useState<ShopState | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getShopStateAction().then(setState);
  }, []);

  async function refresh() {
    setState(await getShopStateAction());
  }

  async function buy(item: ShopItem) {
    setBusyItemId(item.id);
    setError(null);
    try {
      const next = await purchaseItemAction(item.id);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הרכישה לא הושלמה");
    } finally {
      setBusyItemId(null);
    }
  }

  async function equipTheme(item: ShopItem) {
    setBusyItemId(item.id);
    try {
      await setSkin(skin === item.id ? null : item.id);
    } finally {
      setBusyItemId(null);
    }
  }

  async function equipTrail(item: ShopItem) {
    setBusyItemId(item.id);
    try {
      const next = state?.activeParticleTrail === item.id ? null : item.id;
      await setActiveParticleTrailAction(next);
      onActiveTrailChange(next);
      await refresh();
    } finally {
      setBusyItemId(null);
    }
  }

  const categories: ShopItemCategory[] = ["theme", "trail", "badge", "shield"];

  return (
    <Modal open onClose={onClose} align="center" label="חנות Life Plus" panelClassName="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-5">
      <div dir="rtl" className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">חנות Life Plus</h2>
          {state && (
            <p className="text-xs text-muted">
              זמין להוצאה: <span className="font-semibold text-gold-ink">{state.availableXp} XP</span> מתוך {state.earnedXp} XP שנצברו
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="סגור" className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground">
          <X size={18} aria-hidden />
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-xs text-accent-family">
          {error}
        </p>
      )}

      <div dir="rtl" className="min-h-0 flex-1 overflow-y-auto">
        {!state && <p className="py-10 text-center text-sm text-muted">טוען...</p>}

        {state &&
          categories.map((category) => {
            const Icon = CATEGORY_ICON[category];
            const items = SHOP_ITEMS.filter((i) => i.category === category);
            return (
              <section key={category} className="mb-6">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Icon size={14} className="text-accent-learning" aria-hidden />
                  {CATEGORY_LABEL[category]}
                  {category === "shield" && <span className="text-xs font-normal text-muted">— יש לך {state.shieldCount}</span>}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const owned = state.ownedItemIds.includes(item.id);
                    const equipped = category === "theme" ? skin === item.id : category === "trail" ? state.activeParticleTrail === item.id : false;
                    const affordable = state.availableXp >= item.cost;
                    const busy = busyItemId === item.id;

                    return (
                      <div key={item.id} className={cn("flex items-center justify-between gap-2 rounded-2xl border p-3", equipped ? "border-accent-learning/40 bg-accent-learning/[0.06]" : "border-hairline-card bg-surface")}>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                            {item.name}
                            {equipped && <Check size={13} className="text-accent-learning" aria-hidden />}
                          </p>
                          <p className="text-xs text-muted">{item.cost} XP</p>
                        </div>

                        {category === "shield" ? (
                          <button
                            onClick={() => void buy(item)}
                            disabled={busy || !affordable}
                            className="focus-ring shrink-0 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity disabled:opacity-40"
                          >
                            {busy ? "..." : "רכוש עוד"}
                          </button>
                        ) : !owned ? (
                          <button
                            onClick={() => void buy(item)}
                            disabled={busy || !affordable}
                            title={!affordable ? "אין מספיק XP" : undefined}
                            className="focus-ring shrink-0 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity disabled:opacity-40"
                          >
                            {busy ? "..." : !affordable ? "חסר XP" : "רכוש"}
                          </button>
                        ) : item.equippable ? (
                          <button
                            onClick={() => void (category === "theme" ? equipTheme(item) : equipTrail(item))}
                            disabled={busy}
                            className={cn(
                              "focus-ring shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40",
                              equipped ? "bg-fill-subtle text-muted" : "bg-accent-learning/15 text-accent-learning"
                            )}
                          >
                            {busy ? "..." : equipped ? "הסר" : "החל"}
                          </button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent-learning">
                            <Check size={13} aria-hidden />
                            נרכש
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </Modal>
  );
}
