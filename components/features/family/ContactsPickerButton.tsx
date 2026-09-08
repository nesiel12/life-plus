"use client";

import { useEffect, useState } from "react";
import { Contact, Loader2 } from "lucide-react";

// The Web Contacts Picker (navigator.contacts.select). Chrome on Android
// only, HTTPS + a user gesture required — it opens the OS contact sheet and
// hands back exactly the fields asked for, for exactly the contacts the user
// tapped. Nothing is read without that explicit pick.
//
// Feature-detected: the button simply does not render where the API is
// missing (desktop, iOS Safari, Firefox), so it never sits there dead.

interface ContactPick {
  name?: string;
  phone?: string;
}

interface NavigatorContacts {
  select: (
    properties: string[],
    options?: { multiple?: boolean }
  ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
  getProperties?: () => Promise<string[]>;
}

function contactsApi(): NavigatorContacts | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { contacts?: NavigatorContacts }).contacts;
  return api && typeof api.select === "function" ? api : null;
}

export function ContactsPickerButton({ onPick }: { onPick: (pick: ContactPick) => void }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(Boolean(contactsApi()));
  }, []);

  if (!supported) return null;

  async function pick() {
    const api = contactsApi();
    if (!api || busy) return;
    setBusy(true);
    setError(null);
    try {
      const results = await api.select(["name", "tel"], { multiple: false });
      const first = results[0];
      if (!first) return; // the user dismissed the sheet
      onPick({
        name: first.name?.[0]?.trim() || undefined,
        phone: first.tel?.[0]?.replace(/\s+/g, "") || undefined,
      });
    } catch {
      // A rejected permission or an unsupported property set — nothing to
      // recover, just let the user type it in.
      setError("לא הצלחנו לפתוח את אנשי הקשר. אפשר להקליד ידנית.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="focus-ring flex items-center justify-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Contact size={14} aria-hidden />}
        בחר מאנשי הקשר
      </button>
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}
