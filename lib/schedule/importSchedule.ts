import { z } from "zod";
import { MINUTES_IN_DAY, parseMinute, type RoutineKind } from "@/lib/schedule/routine";

// Turning a timetable someone already has — a photo of a school schedule, a
// pasted shift roster, a copied table — into routine blocks.
//
// The model's only job is extraction: read what is written and report it. It
// never invents a schedule, and it never decides what is saved. Everything it
// returns is normalised and validated here, then shown to the user for
// confirmation before a single row is written.

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

/**
 * What the model is asked to produce.
 *
 * Times are strings, not minute counts: models are markedly better at
 * transcribing "09:15" than at arithmetic on it, and the conversion is
 * trivial and testable here. Weekdays are numbers because Sunday=0 is
 * unambiguous, where a Hebrew day name is not ("יום א׳" vs "ראשון" vs "א").
 */
export const scheduleImportSchema = z.object({
  blocks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        kind: z.enum(KINDS as [RoutineKind, ...RoutineKind[]]),
        weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        note: z.string().trim().max(200).optional(),
      })
    )
    .max(60),
  /** What the model could not read, in the user's language. */
  warnings: z.array(z.string().trim().max(200)).max(10).default([]),
});

export type ScheduleImportResult = z.infer<typeof scheduleImportSchema>;

export const SCHEDULE_IMPORT_SYSTEM_PROMPT = `אתה קורא מערכת שעות והופך אותה לבלוקים שבועיים קבועים.

כללים:
- חלץ אך ורק את מה שכתוב במקור. אל תמציא שיעורים, שעות או ימים.
- כל בלוק הוא כלל שבועי חוזר: אם אותו שיעור מופיע בימים ראשון ושלישי באותה שעה, זה בלוק אחד עם weekdays: [0, 2].
- ימים: ראשון=0, שני=1, שלישי=2, רביעי=3, חמישי=4, שישי=5, שבת=6.
- שעות בפורמט 24 שעות "HH:MM". אם כתוב רק שעת התחלה, הערך סוף סביר לפי משך השיעורים האחרים במקור, וציין זאת ב-warnings.
- kind: work=עבודה, study=לימודים כלליים, torah=לימודי קודש/ישיבה, training=אימון/ספורט, rest=מנוחה/שינה, meal=ארוחה, commute=נסיעה, family=משפחה, free=זמן פנוי מוגן, other=כל השאר.
- title בעברית, קצר, כמו שכתוב במקור.
- אם משהו לא ברור או לא קריא — אל תנחש. דלג עליו וכתוב על כך ב-warnings בעברית.
- אם אין במקור מערכת שעות בכלל, החזר blocks ריק והסבר ב-warnings.`;

export interface NormalizedBlock {
  title: string;
  kind: RoutineKind;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  note?: string;
}

export interface NormalizeOutcome {
  blocks: NormalizedBlock[];
  /** Model warnings plus anything rejected during normalisation. */
  warnings: string[];
}

/**
 * Converts the model's output into storable blocks, dropping what cannot be
 * stored honestly.
 *
 * Every rejection produces a warning the user actually sees. Silently
 * discarding a row the model got slightly wrong would leave a gap in someone's
 * timetable that they have no way to notice — the whole point of the
 * confirmation step is that they can see exactly what is about to be saved.
 */
export function normalizeImportedBlocks(result: ScheduleImportResult): NormalizeOutcome {
  const blocks: NormalizedBlock[] = [];
  const warnings = [...result.warnings];

  for (const raw of result.blocks) {
    const startMinute = parseMinute(raw.startTime);
    const endMinute = parseMinute(raw.endTime);

    if (startMinute === null || endMinute === null) {
      warnings.push(`דילגנו על "${raw.title}" — לא הצלחנו לקרוא את השעות (${raw.startTime}–${raw.endTime}).`);
      continue;
    }

    if (endMinute <= startMinute) {
      // Most often a block written as 22:00-01:00, i.e. crossing midnight.
      // The storage model is deliberately within-day, so rather than silently
      // truncating it to nothing, say so and let the user split it by hand.
      warnings.push(
        `דילגנו על "${raw.title}" — שעת הסיום (${raw.endTime}) אינה אחרי שעת ההתחלה (${raw.startTime}). בלוק שחוצה חצות צריך להיות מפוצל לשניים.`
      );
      continue;
    }

    const weekdays = [...new Set(raw.weekdays)].sort((a, b) => a - b);
    if (weekdays.length === 0) {
      warnings.push(`דילגנו על "${raw.title}" — לא צוינו ימים.`);
      continue;
    }

    blocks.push({
      title: raw.title,
      kind: raw.kind,
      weekdays,
      startMinute,
      endMinute: Math.min(endMinute, MINUTES_IN_DAY),
      note: raw.note,
    });
  }

  return { blocks: dedupe(blocks), warnings };
}

/**
 * Collapses blocks that are identical except for their weekdays.
 *
 * A model reading a grid often emits one row per cell — the same 09:00 lesson
 * five times, once per column. Merging them is what turns that back into the
 * single weekly rule the user would have written themselves.
 */
function dedupe(blocks: NormalizedBlock[]): NormalizedBlock[] {
  const byKey = new Map<string, NormalizedBlock>();
  for (const block of blocks) {
    const key = `${block.title}|${block.kind}|${block.startMinute}|${block.endMinute}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.weekdays = [...new Set([...existing.weekdays, ...block.weekdays])].sort((a, b) => a - b);
    } else {
      byKey.set(key, { ...block, weekdays: [...block.weekdays] });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title, "he")
  );
}

/** Pairs that occupy the same weekday and overlap in time. */
export function findOverlaps(blocks: NormalizedBlock[]): [NormalizedBlock, NormalizedBlock][] {
  const clashes: [NormalizedBlock, NormalizedBlock][] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      const sharesDay = a.weekdays.some((d) => b.weekdays.includes(d));
      if (!sharesDay) continue;
      if (a.startMinute < b.endMinute && b.startMinute < a.endMinute) clashes.push([a, b]);
    }
  }
  return clashes;
}
