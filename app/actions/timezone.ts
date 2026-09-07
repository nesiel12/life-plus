"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { isValidTimezone } from "@/lib/proactive/timezone";

/**
 * Records which timezone the user is actually in.
 *
 * Called from the app shell with `Intl.DateTimeFormat().resolvedOptions()
 * .timeZone` — the browser already knows, so asking the user would be a
 * question with a knowable answer. It stays overridable in settings for the
 * person whose device zone is wrong, or who wants briefings on home time
 * while travelling.
 *
 * Everything user-local in the Proactive Engine reads this: what hour "07:00
 * briefing" means, when the daily notification cap resets, and which side of
 * midnight a reminder falls on.
 *
 * Returns the stored zone, or null when the value was rejected — the caller
 * is a fire-and-forget effect, so a bad value must not throw into a render.
 */
export async function setTimezoneAction(timezone: string): Promise<string | null> {
  // The migration's CHECK is only a shape guard; Postgres has no list of IANA
  // zones. This is the real gate, and it runs on the server so a crafted
  // client request cannot poison the column.
  if (!isValidTimezone(timezone)) return null;

  const userId = await getCurrentUserId();
  await personalDnaRepo.upsert(userId, { timezone });
  return timezone;
}
