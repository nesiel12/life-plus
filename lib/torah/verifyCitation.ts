import "server-only";
import { detectCitations, isPlausibleSefariaRef } from "@/lib/torah/citations";
import { bookTitleKey } from "@/lib/torah/hebrew";
import { sefariaReadUrl, sefariaResolveRef, sefariaText } from "@/lib/torah/sources/providers";

export interface VerifiedCitation {
  reference: string;
  note: string;
  verified: boolean;
  sefariaRef: string | null;
  sefariaUrl: string | null;
  quotedText: string | null;
}

/**
 * Resolves one model-written citation to a real, fetchable text.
 *
 * Two deterministic resolvers, in order: the local gematria-aware parser for
 * Tanach/Talmud/Halacha shapes, then Sefaria's own name API for everything
 * else. Shared by the book assistant and the Havruta, so "אומת מול ספריא"
 * means exactly the same thing on both.
 *
 * `contextTitle` is the book in discussion, when there is one: a reference
 * without the book's name ("סימן ר״ה") is tried with the title prefixed FIRST
 * — resolved bare, a vague reference could match a different work entirely
 * and be marked "verified" against the wrong book.
 */
export async function verifyCitation(
  citation: { reference: string; note: string },
  contextTitle?: string
): Promise<VerifiedCitation> {
  let ref: string | null = null;

  const [detected] = detectCitations(citation.reference);
  if (detected?.sefariaRef && isPlausibleSefariaRef(detected.sefariaRef)) ref = detected.sefariaRef;

  if (!ref && contextTitle) {
    const namesBook = bookTitleKey(citation.reference).startsWith(bookTitleKey(contextTitle));
    if (!namesBook) ref = await sefariaResolveRef(`${contextTitle} ${citation.reference}`).catch(() => null);
  }
  if (!ref) ref = await sefariaResolveRef(citation.reference).catch(() => null);

  if (!ref) return { ...citation, verified: false, sefariaRef: null, sefariaUrl: null, quotedText: null };

  const text = await sefariaText(ref).catch(() => null);
  const quoted = text?.hebrew.slice(0, 3).join(" ").slice(0, 600) || null;

  return {
    ...citation,
    // Verified means Sefaria both recognised the reference and returned its
    // text — a ref that parses but has no text is as unverifiable as none.
    verified: Boolean(quoted),
    sefariaRef: ref,
    sefariaUrl: sefariaReadUrl(ref),
    quotedText: quoted,
  };
}
