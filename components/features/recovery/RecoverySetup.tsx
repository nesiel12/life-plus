"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecoverySetupInput {
  title: string;
  cleanSince: string;
  reasons: string[];
  triggers: string[];
  riskHours: number[];
  copingStrategies: string[];
}

interface RecoverySetupProps {
  onCreate: (input: RecoverySetupInput) => Promise<void>;
  onCancel?: () => void;
}

/** A tag-style list input: type, Enter, it becomes a chip. */
function ListInput({
  label,
  hint,
  placeholder,
  values,
  onChange,
  max = 10,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value || values.length >= max || values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>

      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li
              key={value}
              className="flex items-center gap-1.5 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-foreground"
            >
              <span className="max-w-[16rem] truncate">{value}</span>
              <button
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`הסר ${value}`}
                className="focus-ring rounded p-0.5 text-muted hover:text-foreground"
              >
                <X size={11} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {values.length < max && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            aria-label={label}
            maxLength={200}
            className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button
            onClick={add}
            aria-label="הוסף"
            className="focus-ring glass-control grid size-9 shrink-0 place-items-center rounded-lg text-foreground"
          >
            <Plus size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Setting up a recovery program.
 *
 * The order is deliberate. What you are quitting and when you started are the
 * only required fields — someone deciding to quit today should not have to
 * complete a questionnaire first. Everything else is optional and asked for
 * because of where it gets used: the reasons are what the support sheet shows
 * back at 2am, and the risk hours are when a quiet message arrives.
 */
export function RecoverySetup({ onCreate, onCancel }: RecoverySetupProps) {
  const [title, setTitle] = useState("");
  const [startedToday, setStartedToday] = useState(true);
  const [cleanSinceDate, setCleanSinceDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [reasons, setReasons] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [riskHours, setRiskHours] = useState<number[]>([]);
  const [copingStrategies, setCopingStrategies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setError("צריך לכתוב ממה אתה נגמל.");
      return;
    }

    const cleanSince = startedToday
      ? new Date().toISOString()
      : // Midday, so the date cannot slip a day either way when read back in
        // another timezone.
        new Date(`${cleanSinceDate}T12:00:00`).toISOString();

    if (new Date(cleanSince).getTime() > Date.now()) {
      setError("תאריך ההתחלה לא יכול להיות בעתיד.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        cleanSince,
        reasons,
        triggers,
        riskHours,
        copingStrategies,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו ליצור את התוכנית.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <label htmlFor="recovery-title" className="text-sm text-foreground">
          ממה אתה נגמל?
        </label>
        <p className="mt-0.5 text-xs text-muted">במילים שלך. אף אחד אחר לא רואה את זה.</p>
        <input
          id="recovery-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: עישון"
          maxLength={80}
          className="focus-ring mt-2 w-full rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">מתי התחלת?</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStartedToday(true)}
            aria-pressed={startedToday}
            className={cn(
              "focus-ring rounded-lg border px-3 py-1.5 text-xs transition-colors",
              startedToday
                ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                : "border-hairline-card text-muted hover:text-foreground"
            )}
          >
            מתחיל עכשיו
          </button>
          <button
            onClick={() => setStartedToday(false)}
            aria-pressed={!startedToday}
            className={cn(
              "focus-ring rounded-lg border px-3 py-1.5 text-xs transition-colors",
              !startedToday
                ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                : "border-hairline-card text-muted hover:text-foreground"
            )}
          >
            כבר נקי מתאריך
          </button>
        </div>
        {!startedToday && (
          <input
            type="date"
            value={cleanSinceDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setCleanSinceDate(e.target.value)}
            aria-label="נקי מתאריך"
            className="ltr focus-ring w-fit rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground"
          />
        )}
      </div>

      <ListInput
        label="למה אתה עושה את זה"
        hint="זה מה שיוצג לך כשיהיה קשה. שווה להשקיע כאן דקה."
        placeholder="למשל: אני רוצה להיות בכושר בשביל הילדים"
        values={reasons}
        onChange={setReasons}
      />

      <ListInput
        label="מה בדרך כלל מפעיל את זה"
        hint="לחץ, שעמום, אנשים מסוימים, מקומות."
        placeholder="למשל: לחץ בעבודה"
        values={triggers}
        onChange={setTriggers}
        max={15}
      />

      <ListInput
        label="מה תעשה במקום"
        hint="דברים קונקרטיים שאפשר לעשות במקום, ברגע עצמו."
        placeholder="למשל: לצאת להליכה של עשר דקות"
        values={copingStrategies}
        onChange={setCopingStrategies}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">שעות שקשה לך בהן</p>
        <p className="text-xs text-muted">
          בשעות האלה תקבל הודעה שקטה, לפני שזה מגיע. אפשר להשאיר ריק — המערכת גם תלמד את זה לבד
          מהדחפים שתתעד.
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 24 }, (_, hour) => {
            const on = riskHours.includes(hour);
            return (
              <button
                key={hour}
                onClick={() =>
                  setRiskHours(
                    on ? riskHours.filter((h) => h !== hour) : [...riskHours, hour].sort((a, b) => a - b)
                  )
                }
                aria-pressed={on}
                aria-label={`${hour}:00`}
                className={cn(
                  "ltr focus-ring w-10 rounded-md border py-1 text-[0.65rem] tabular-nums transition-colors",
                  on
                    ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {String(hour).padStart(2, "0")}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="focus-ring flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
          התחל
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="focus-ring rounded-lg border border-hairline-card px-4 py-2.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            ביטול
          </button>
        )}
      </div>
    </div>
  );
}
