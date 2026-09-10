"use client";

import { useEffect, useState } from "react";
import { Contact, Loader2, Phone, UserPlus } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

// "הוסף איש קשר" as a two-choice flow, per the spec:
//   1. Pick from the phone's contacts  (Web Contacts Picker — Chrome/Android)
//   2. Enter a number by hand           (name + relation + phone)
//
// The picker just prefills step 2, so a picked contact still gets a relation
// before it is saved. Where the picker API is missing (desktop, iOS, Firefox)
// the choice screen says so and the manual path is the whole flow.

interface NavigatorContacts {
  select: (
    properties: string[],
    options?: { multiple?: boolean }
  ) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
}

function contactsApi(): NavigatorContacts | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as Navigator & { contacts?: NavigatorContacts }).contacts;
  return api && typeof api.select === "function" ? api : null;
}

// Lenient international check: optional +, 7–15 digits, spaces / dashes /
// parens allowed. Good enough to catch a fat-fingered entry without
// rejecting a legitimate number in a format we didn't anticipate.
function normalisePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}
function isValidPhone(raw: string): boolean {
  const p = normalisePhone(raw);
  return /^\+?\d{7,15}$/.test(p);
}

export interface NewContactInput {
  name: string;
  relation: string;
  phone?: string;
}

export function AddContactModal({
  open,
  onClose,
  onCreate,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewContactInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [pickerSupported, setPickerSupported] = useState<boolean | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerNote, setPickerNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    setPickerSupported(Boolean(contactsApi()));
  }, []);

  // Reset when the modal is dismissed so it always reopens on the choice
  // screen with clean fields.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep("choose");
      setName("");
      setRelation("");
      setPhone("");
      setPhoneError(null);
      setPickerNote(null);
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  async function pickFromDevice() {
    const api = contactsApi();
    if (!api || pickerBusy) return;
    setPickerBusy(true);
    setPickerNote(null);
    try {
      const results = await api.select(["name", "tel"], { multiple: false });
      const first = results[0];
      if (!first) {
        setPickerBusy(false);
        return; // sheet dismissed
      }
      setName(first.name?.[0]?.trim() ?? "");
      setPhone(first.tel?.[0]?.trim() ?? "");
      setStep("form");
    } catch {
      setPickerNote("לא הצלחנו לפתוח את אנשי הקשר של המכשיר. אפשר להוסיף ידנית.");
    } finally {
      setPickerBusy(false);
    }
  }

  function submit() {
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setPhoneError("מספר טלפון לא תקין. הזן 7–15 ספרות, אפשר עם קידומת בינלאומית.");
      return;
    }
    setPhoneError(null);
    onCreate({
      name: name.trim(),
      relation: relation.trim() || "איש קשר",
      phone: trimmedPhone ? normalisePhone(trimmedPhone) : undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} zIndex={Z_INDEX.modal} panelClassName="max-w-md p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
        <UserPlus size={18} className="text-accent-family" aria-hidden />
        הוסף איש קשר
      </h2>

      {step === "choose" ? (
        <div className="flex flex-col gap-2.5">
          {pickerSupported && (
            <button
              onClick={pickFromDevice}
              disabled={pickerBusy}
              className="focus-ring flex items-center gap-3 rounded-xl border border-hairline-card px-4 py-3 text-start transition-colors hover:border-accent-family/40 hover:bg-fill-subtle disabled:opacity-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-family/12 text-accent-family">
                {pickerBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Contact size={16} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">בחר מאנשי הקשר</span>
                <span className="block text-xs text-muted">נפתחת רשימת אנשי הקשר של המכשיר</span>
              </span>
            </button>
          )}

          <button
            onClick={() => setStep("form")}
            className="focus-ring flex items-center gap-3 rounded-xl border border-hairline-card px-4 py-3 text-start transition-colors hover:border-accent-family/40 hover:bg-fill-subtle"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted">
              <Phone size={16} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">הוסף מספר ידנית</span>
              <span className="block text-xs text-muted">שם, קרבה ומספר טלפון</span>
            </span>
          </button>

          {pickerSupported === false && (
            <p className="text-xs text-muted">
              בחירה מאנשי הקשר של המכשיר זמינה בדפדפן הנייד (Chrome ב-Android). כאן אפשר להוסיף ידנית.
            </p>
          )}
          {pickerNote && <p className="text-xs text-accent-family">{pickerNote}</p>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            שם
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: אמא"
              autoFocus
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            קרבה
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="למשל: אמא, חבר, אח"
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            טלפון (לא חובה)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              placeholder="+972 50 000 0000"
              className={cn(
                "focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted",
                phoneError && "ring-1 ring-accent-family"
              )}
            />
          </label>

          {phoneError && <p className="text-xs text-accent-family">{phoneError}</p>}
          {error && <p className="text-xs text-accent-family">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="focus-ring rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              חזרה
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-family/20 px-4 py-2 text-sm font-medium text-accent-family transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <UserPlus size={14} aria-hidden />}
              שמור
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
