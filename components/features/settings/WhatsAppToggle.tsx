"use client";

import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface WhatsAppToggleProps {
  /** The stored `whatsappNumber` (E.164) or null if none is saved. */
  whatsappNumber: string | null;
  /** The stored `channelWhatsapp` preference. */
  enabled: boolean;
  saving: boolean;
  /** Persist the preference (settings page's `save`). */
  onSave: (patch: { whatsappNumber?: string | null; channelWhatsapp?: boolean }) => void;
}

// WhatsApp notifications for the daily briefing, reminders and nudges. Unlike
// push (self-contained via a browser subscription), a number has to be saved
// before the toggle means anything — so this owns a small phone-number form
// alongside the toggle, rather than just the toggle PushToggle.tsx has.
export function WhatsAppToggle({ whatsappNumber, enabled, saving, onSave }: WhatsAppToggleProps) {
  const [draft, setDraft] = useState(whatsappNumber ?? "");

  const dirty = draft.trim() !== (whatsappNumber ?? "");

  return (
    <GlassCard>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        <MessageCircle size={16} className="text-accent-career" aria-hidden />
        התראות ב-WhatsApp
      </p>
      <p className="mb-4 text-xs text-muted">
        תדריך הבוקר, תזכורות ותובנות יישלחו גם ל-WhatsApp שלך, בהודעות קצרות.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <input
          type="tel"
          dir="ltr"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="050-123-4567"
          className="glass-control focus-ring min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm text-foreground"
        />
        <button
          onClick={() => onSave({ whatsappNumber: draft.trim() || null })}
          disabled={saving || !dirty}
          className="focus-ring glass-control shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
        >
          שמור מספר
        </button>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm text-foreground">
          {whatsappNumber ? "קבלת התראות" : "צריך מספר שמור כדי להפעיל"}
        </span>
        <span className="flex items-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin text-muted" aria-hidden />}
          <input
            type="checkbox"
            checked={enabled}
            disabled={!whatsappNumber || saving}
            onChange={(e) => onSave({ channelWhatsapp: e.target.checked })}
            className="focus-ring size-4 shrink-0 accent-[var(--gold)]"
          />
        </span>
      </label>
    </GlassCard>
  );
}
