"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { routineBlocksRepo, type RoutineBlockDraft } from "@/lib/db/routineBlocks";
import { toRoutineBlock, toRoutineBlockPatch } from "@/lib/mappers";
import { MINUTES_IN_DAY, type RoutineBlock, type RoutineKind } from "@/lib/schedule/routine";
import type { RoutineKindDb } from "@/types/database";

const KINDS: RoutineKind[] = [
  "work",
  "study",
  "torah",
  "training",
  "rest",
  "meal",
  "commute",
  "family",
  "free",
  "other",
];

export interface RoutineBlockInput {
  title: string;
  kind: RoutineKind;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  note?: string;
}

/**
 * Validates a block before it reaches the database.
 *
 * The table's CHECK constraints cover the same ground, but a constraint
 * violation surfaces as an opaque Postgres error; this produces a Hebrew
 * message the UI can show. It also guarantees the AI import path is held to
 * exactly the same rules as hand entry, since both land here.
 */
function validate(input: RoutineBlockInput): RoutineBlockDraft {
  const title = input.title.trim();
  if (!title) throw new Error("לבלוק חייב להיות שם.");
  if (title.length > 80) throw new Error("השם ארוך מדי.");

  if (!KINDS.includes(input.kind)) throw new Error("סוג בלוק לא מוכר.");

  const weekdays = [...new Set(input.weekdays)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (weekdays.length === 0) throw new Error("צריך לבחור לפחות יום אחד.");

  const startMinute = Math.round(input.startMinute);
  const endMinute = Math.round(input.endMinute);
  if (!Number.isFinite(startMinute) || startMinute < 0 || startMinute >= MINUTES_IN_DAY) {
    throw new Error("שעת ההתחלה לא תקינה.");
  }
  if (!Number.isFinite(endMinute) || endMinute <= 0 || endMinute > MINUTES_IN_DAY) {
    throw new Error("שעת הסיום לא תקינה.");
  }
  if (endMinute <= startMinute) {
    throw new Error("שעת הסיום חייבת להיות אחרי שעת ההתחלה. בלוק שחוצה חצות צריך להיות מפוצל לשניים.");
  }

  return {
    title,
    kind: input.kind as RoutineKindDb,
    weekdays,
    start_minute: startMinute,
    end_minute: endMinute,
    note: input.note?.trim() || null,
  };
}

export async function listRoutineBlocksAction(): Promise<RoutineBlock[]> {
  const userId = await getCurrentUserId();
  const rows = await routineBlocksRepo.list(userId);
  return rows.map(toRoutineBlock);
}

export async function addRoutineBlockAction(input: RoutineBlockInput): Promise<RoutineBlock> {
  const userId = await getCurrentUserId();
  const row = await routineBlocksRepo.insert({ ...validate(input), user_id: userId });
  return toRoutineBlock(row);
}

export async function updateRoutineBlockAction(
  blockId: string,
  patch: Partial<RoutineBlock>
): Promise<RoutineBlock> {
  const userId = await getCurrentUserId();

  // A patch that changes either end of the range has to be validated against
  // the *resulting* block, not the fields in isolation — moving only the end
  // time can still put it before an unchanged start time.
  if (patch.startMinute !== undefined || patch.endMinute !== undefined || patch.weekdays !== undefined) {
    const existing = (await routineBlocksRepo.list(userId)).find((b) => b.id === blockId);
    if (!existing) throw new Error("הבלוק לא נמצא.");
    const current = toRoutineBlock(existing);
    validate({
      title: patch.title ?? current.title,
      kind: patch.kind ?? current.kind,
      weekdays: patch.weekdays ?? current.weekdays,
      startMinute: patch.startMinute ?? current.startMinute,
      endMinute: patch.endMinute ?? current.endMinute,
      note: patch.note ?? current.note,
    });
  }

  const row = await routineBlocksRepo.update(userId, blockId, toRoutineBlockPatch(patch));
  return toRoutineBlock(row);
}

export async function deleteRoutineBlockAction(blockId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await routineBlocksRepo.remove(userId, blockId);
}

/**
 * Writes a confirmed AI import.
 *
 * The separate confirm step is the point: the model proposed, the user looked
 * at exactly these blocks and said yes. `replace` is explicitly opt-in —
 * appending is the default so a second import cannot silently discard a
 * timetable the user has since edited by hand.
 */
export async function importRoutineBlocksAction(
  blocks: RoutineBlockInput[],
  options: { replace?: boolean } = {}
): Promise<RoutineBlock[]> {
  const userId = await getCurrentUserId();
  if (blocks.length === 0) return [];
  if (blocks.length > 60) throw new Error("יותר מדי בלוקים בייבוא אחד.");

  const drafts = blocks.map(validate);
  const rows = options.replace
    ? await routineBlocksRepo.replaceAll(userId, drafts)
    : await routineBlocksRepo.insertMany(userId, drafts);

  return rows.map(toRoutineBlock);
}
