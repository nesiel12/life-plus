import { describeNeglect, findNeglected, type NeglectCandidate, type NeglectSignal } from "@/lib/family/neglect";
import { buildMessage, whatsappLink } from "@/lib/family/whatsapp";
import type { Person, PersonRole } from "@/types";

// Family CRM <-> WhatsApp: from "you haven't spoken to Mom in two weeks" to a
// message that is one tap from sent.
//
// findNeglected (lib/family/neglect.ts) decides who is worth reaching out to;
// buildMessage/whatsappLink (lib/family/whatsapp.ts) write the words and the
// wa.me link. This joins them. It sends nothing — the link opens WhatsApp with
// the text pre-filled and the person presses send, which is the human-in-the-
// loop rule lib/family/whatsapp.ts states for itself ("there is deliberately no
// send path to disable later").

/**
 * People worth reaching out to, most pressing first.
 *
 * A person with no logged interaction has no date to measure from (Person has
 * no createdAt), so they are stamped "now" and never flagged. That is the
 * conservative reading of findNeglected's own rule — never turn an import of a
 * contact list into a wall of accusations — and a birthday inside the week
 * still surfaces them.
 */
export function familyCheckIns(people: readonly Person[], now: Date, limit = 2): NeglectSignal[] {
  const candidates: NeglectCandidate[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    hebrewName: p.hebrewName,
    relation: p.relation,
    phone: p.phone,
    lastMeaningfulInteraction: p.lastMeaningfulInteraction,
    birthday: p.birthday,
    createdAt: now.toISOString(),
  }));
  return findNeglected(candidates, now, { limit });
}

/**
 * The role a message template is written for. An explicit role wins; otherwise
 * it is read from the free-text relation ("אמא", "חבר קרוב"), and anything
 * unrecognised is "other" — whose template is generic rather than wrong.
 */
export function inferRole(person: Pick<Person, "role" | "relation">): PersonRole {
  if (person.role) return person.role;
  const relation = person.relation;
  if (/סבתא|grandmother/i.test(relation)) return "grandmother";
  if (/סבא|grandfather/i.test(relation)) return "grandfather";
  if (/אמא|אימא|אמי|mother|mom/i.test(relation)) return "mother";
  if (/אבא|אבי|father|dad/i.test(relation)) return "father";
  if (/חבר|friend/i.test(relation)) return "friend";
  return "other";
}

// A birthday today deserves a birthday wish, not "how are you". Phrased so it
// conjugates for neither the sender nor the recipient ("שתהיה" agrees with the
// year, a feminine noun) — the standard lib/family/whatsapp.ts holds its own
// neutral forms to, since the app knows the recipient's gender only when set
// and never the sender's.
const BIRTHDAY_MESSAGE = "יום הולדת שמח, {name}! שתהיה לך שנה מלאה בטוב ובבריאות.";

export interface OutreachDraft {
  personId: string;
  /** The name to show — the Hebrew one when there is one. */
  name: string;
  /** Why now, one line in Hebrew. */
  reason: string;
  /** The pre-written message. */
  message: string;
  /** A wa.me link with the message pre-filled, or null when there is no usable number. */
  href: string | null;
  signal: NeglectSignal;
}

/**
 * Drafts for the people most worth contacting. A custom template the person
 * set for a contact wins outright (lib/family/whatsapp.ts buildMessage) — it
 * is their own wording, and is not swapped for the birthday line either.
 */
export function buildOutreachDrafts(people: readonly Person[], now: Date, limit = 2): OutreachDraft[] {
  const byId = new Map(people.map((p) => [p.id, p]));

  return familyCheckIns(people, now, limit).flatMap((signal) => {
    const person = byId.get(signal.person.id);
    if (!person) return [];

    const name = person.hebrewName?.trim() || person.name;
    const hasCustom = Boolean(person.messageTemplate?.trim());
    const message =
      signal.birthdayInDays === 0 && !hasCustom
        ? BIRTHDAY_MESSAGE.replace(/\{name\}/g, name)
        : buildMessage({
            role: inferRole(person),
            gender: person.gender,
            name,
            customTemplate: person.messageTemplate,
          });

    return [
      {
        personId: person.id,
        name,
        reason: describeNeglect(signal),
        message,
        href: whatsappLink(person.phone, message),
        signal,
      },
    ];
  });
}
