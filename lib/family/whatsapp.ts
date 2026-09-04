import type { PersonGender, PersonRole } from "@/types";

// WhatsApp messaging for Family & Friends — gendered Hebrew, role templates,
// and the pre-filled deep link.
//
// Human-in-the-loop by construction (LifeOS Pillar 4): nothing here sends
// anything. It produces text and a wa.me URL, and the person clicks. There
// is deliberately no send path to disable later.
//
// Why gender is a required input rather than something inferred: Hebrew
// conjugates the second person by gender in almost every sentence worth
// sending ("מה שלומך" is shared, but "איך אתה מרגיש" / "איך את מרגישה" is
// not). Guessing from a name is unreliable across Hebrew, Arabic and
// transliterated names alike, and getting it wrong is the kind of small
// insult that makes a person stop using the feature. So it is an explicit
// per-contact setting, and the neutral phrasing below is what's used until
// it's set — never a coin flip.

export interface GenderedPhrase {
  male: string;
  female: string;
  /** Used when gender is unset — phrased to work for either. */
  neutral: string;
}

/** Picks the right form, defaulting to the neutral phrasing. */
export function forGender(phrase: GenderedPhrase, gender: PersonGender | undefined): string {
  if (gender === "male") return phrase.male;
  if (gender === "female") return phrase.female;
  return phrase.neutral;
}

// One template per role, in all three forms. The neutral variant is not a
// lazy fallback — each one is written to be genuinely idiomatic without
// conjugating, so an unset gender still reads naturally.
const ROLE_TEMPLATES: Record<PersonRole, GenderedPhrase> = {
  mother: {
    male: "אמא, חשבתי עלייך. איך את מרגישה היום?",
    female: "אמא, חשבתי עלייך. איך את מרגישה היום?",
    neutral: "אמא, חשבתי עלייך. מה שלומך היום?",
  },
  father: {
    male: "אבא, חשבתי עליך. איך אתה מרגיש היום?",
    female: "אבא, חשבתי עליך. איך אתה מרגיש היום?",
    neutral: "אבא, חשבתי עליך. מה שלומך היום?",
  },
  grandfather: {
    male: "סבא יקר, רק רציתי לבדוק מה שלומך. אתה מרגיש טוב?",
    female: "סבא יקר, רק רציתי לבדוק מה שלומך. אתה מרגיש טוב?",
    neutral: "סבא יקר, רק רציתי לבדוק מה שלומך.",
  },
  grandmother: {
    male: "סבתא יקרה, רק רציתי לבדוק מה שלומך. את מרגישה טוב?",
    female: "סבתא יקרה, רק רציתי לבדוק מה שלומך. את מרגישה טוב?",
    neutral: "סבתא יקרה, רק רציתי לבדוק מה שלומך.",
  },
  friend: {
    male: "היי, מזמן לא דיברנו. מה אתה עושה בזמן האחרון?",
    female: "היי, מזמן לא דיברנו. מה את עושה בזמן האחרון?",
    neutral: "היי, מזמן לא דיברנו. מה שלומך?",
  },
  other: {
    male: "היי, מה שלומך? חשבתי עליך.",
    female: "היי, מה שלומך? חשבתי עלייך.",
    neutral: "היי, מה שלומך?",
  },
};

export const ROLE_LABELS: Record<PersonRole, string> = {
  mother: "אמא",
  father: "אבא",
  grandfather: "סבא",
  grandmother: "סבתא",
  friend: "חבר/ה",
  other: "אחר",
};

/**
 * The default message for a contact.
 *
 * `customTemplate` wins outright when set — it's the user's own words, and
 * silently "improving" it would be worse than useless. `{name}` is the one
 * substitution, so a custom template can still be personal.
 */
export function buildMessage(params: {
  role: PersonRole;
  gender?: PersonGender;
  name: string;
  customTemplate?: string;
}): string {
  const base = params.customTemplate?.trim()
    ? params.customTemplate.trim()
    : forGender(ROLE_TEMPLATES[params.role] ?? ROLE_TEMPLATES.other, params.gender);
  return base.replace(/\{name\}/g, params.name);
}

/**
 * Normalises a phone number to the digits wa.me expects: no plus, no spaces,
 * no punctuation. An Israeli local number ("052-123-4567") is expanded to
 * its international form, since wa.me rejects a leading 0.
 *
 * Returns null rather than a malformed link when there's nothing usable —
 * a broken wa.me URL opens a confusing WhatsApp error page.
 */
export function normalizePhone(raw: string | undefined, defaultCountryCode = "972"): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    return rest.length >= 8 ? rest : null;
  }
  // Local Israeli form: drop the trunk 0, prepend the country code.
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    return rest.length >= 8 ? `${defaultCountryCode}${rest}` : null;
  }
  // Already international, or a bare subscriber number we can't safely
  // expand — accept it only if it's long enough to be a real number.
  return digits.length >= 8 ? digits : null;
}

/**
 * The pre-filled deep link. encodeURIComponent, not encodeURI: the message
 * is Hebrew and routinely contains `&`, `?` and `#`, every one of which
 * would truncate the text in the recipient's compose box if left raw.
 */
export function whatsappLink(phone: string | undefined, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
