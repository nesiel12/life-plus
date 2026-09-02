"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarHeart, Check, Plus, Sparkles, Sunrise, Target, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import { DAY_PARTS } from "@/lib/onboarding/chronotype";
import { cn } from "@/lib/utils";
import type { OnboardingWizardPayload } from "@/app/actions/onboarding";
import type { ChronotypeSettings, DayPart, LifeAreaKey } from "@/types";

// people.birthday / people.anniversary are text columns with a
// `^\d{2}-\d{2}$` CHECK in Postgres — an annual recurrence, deliberately
// without a year. Anything that doesn't match is dropped client-side rather
// than sent, so a half-typed date can't fail the whole wizard submit.
const MONTH_DAY = /^\d{2}-\d{2}$/;

interface DraftPerson {
  id: string;
  name: string;
  relation: string;
  birthday: string;
  anniversary: string;
}

interface DraftGoal {
  id: string;
  title: string;
  category: LifeAreaKey;
  targetDate: string;
}

const STEPS = [
  { title: "מי אתה", hint: "כדי שנדע איך לפנות אליך ומה חשוב לך", icon: Sparkles },
  { title: "הקצב שלך", hint: "מתי אתה בשיא ומתי האנרגיה יורדת", icon: Sunrise },
  { title: "האנשים שלך", hint: "מי שחשוב שלא ניתן לזמן להחליק", icon: CalendarHeart },
  { title: "יעדים והרגלים", hint: "מה תרצה שיקרה השנה", icon: Target },
] as const;

// Stable ids without Math.random / Date.now, which are only used for local
// list keys and never persisted.
let draftCounter = 0;
const nextDraftId = () => `draft-${(draftCounter += 1)}`;

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const saveOnboardingWizard = useAtlasStore((s) => s.saveOnboardingWizard);
  const userName = useAtlasStore((s) => s.user.hebrewName);

  const [step, setStep] = useState(0);

  // Step 1
  const [fullName, setFullName] = useState(userName ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [priorities, setPriorities] = useState<LifeAreaKey[]>([]);

  // Step 2
  const [wakeTime, setWakeTime] = useState("");
  const [sleepTime, setSleepTime] = useState("");
  const [peakFocus, setPeakFocus] = useState<DayPart[]>([]);
  const [lowEnergy, setLowEnergy] = useState<DayPart[]>([]);

  // Step 3
  const [people, setPeople] = useState<DraftPerson[]>([
    { id: nextDraftId(), name: "", relation: "", birthday: "", anniversary: "" },
  ]);

  // Step 4
  const [goals, setGoals] = useState<DraftGoal[]>([
    { id: nextDraftId(), title: "", category: "faith", targetDate: "" },
  ]);
  const [habits, setHabits] = useState<string[]>([]);
  const [habitDraft, setHabitDraft] = useState("");

  const isLast = step === STEPS.length - 1;

  const payload = useMemo((): OnboardingWizardPayload => {
    const chronotype: ChronotypeSettings = {};
    if (wakeTime) chronotype.wakeTime = wakeTime;
    if (sleepTime) chronotype.sleepTime = sleepTime;
    if (peakFocus.length) chronotype.peakFocusHours = peakFocus;
    if (lowEnergy.length) chronotype.lowEnergyHours = lowEnergy;

    return {
      fullName: fullName.trim() || undefined,
      birthDate: birthDate || undefined,
      corePriorities: priorities.length ? priorities : undefined,
      chronotype: Object.keys(chronotype).length ? chronotype : undefined,
      people: people
        .filter((p) => p.name.trim() && p.relation.trim())
        .map((p) => ({
          name: p.name.trim(),
          relation: p.relation.trim(),
          birthday: MONTH_DAY.test(p.birthday) ? p.birthday : undefined,
          anniversary: MONTH_DAY.test(p.anniversary) ? p.anniversary : undefined,
        })),
      goals: goals
        .filter((g) => g.title.trim())
        .map((g) => ({
          title: g.title.trim(),
          category: g.category,
          targetDate: g.targetDate || undefined,
        })),
      habits: habits.length ? habits : undefined,
    };
  }, [fullName, birthDate, priorities, wakeTime, sleepTime, peakFocus, lowEnergy, people, goals, habits]);

  const { loading: saving, error: saveError, run: save } = useApiCall(saveOnboardingWizard);

  function finish() {
    save(payload)
      .then(onDone)
      .catch(() => {
        // surfaced through saveError below; the modal stays open so nothing
        // the person typed is lost
      });
  }

  function advance() {
    if (isLast) finish();
    else setStep((s) => s + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator step={step} />

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{STEPS[step].title}</h2>
        <p className="mt-1 text-sm text-muted">{STEPS[step].hint}</p>
      </div>

      {/* mode="wait" so the outgoing step can't overlap the incoming one and
          double the panel height mid-transition. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="min-h-[16rem]"
        >
          {step === 0 && (
            <IdentityStep
              fullName={fullName}
              onFullName={setFullName}
              birthDate={birthDate}
              onBirthDate={setBirthDate}
              priorities={priorities}
              onPriorities={setPriorities}
            />
          )}
          {step === 1 && (
            <ChronotypeStep
              wakeTime={wakeTime}
              onWakeTime={setWakeTime}
              sleepTime={sleepTime}
              onSleepTime={setSleepTime}
              peakFocus={peakFocus}
              onPeakFocus={setPeakFocus}
              lowEnergy={lowEnergy}
              onLowEnergy={setLowEnergy}
            />
          )}
          {step === 2 && <PeopleStep people={people} onChange={setPeople} />}
          {step === 3 && (
            <GoalsStep
              goals={goals}
              onGoals={setGoals}
              habits={habits}
              onHabits={setHabits}
              habitDraft={habitDraft}
              onHabitDraft={setHabitDraft}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {saveError && (
        <p role="alert" className="text-xs text-accent-family">
          {saveError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={advance}
          disabled={saving}
          className="focus-ring rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          {isLast ? "סיים בלי למלא" : "דלג לעכשיו"}
        </button>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={saving}
              className="focus-ring rounded-lg border border-hairline px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              חזור
            </button>
          )}
          <button
            type="button"
            onClick={advance}
            disabled={saving}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-[var(--background)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
          >
            {saving ? "שומר…" : isLast ? "שמור וסיים" : "שמור והמשך"}
            {!saving && isLast && <Check size={14} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────
// The bar is a plain flex row: the document is dir="rtl", so it already fills
// right-to-left in reading order without any manual reversing.
function StepIndicator({ step }: { step: number }) {
  return (
    <div>
      <div className="flex items-center gap-2" role="presentation">
        {STEPS.map((s, i) => (
          <div key={s.title} className="h-1 flex-1 overflow-hidden rounded-full bg-fill-subtle">
            <motion.div
              className="h-full rounded-full bg-[var(--gold)]"
              initial={false}
              animate={{ width: i <= step ? "100%" : "0%" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        שלב {step + 1} מתוך {STEPS.length}
      </p>
    </div>
  );
}

// ─── Shared field chrome ───────────────────────────────────────────────────
const INPUT_CLASS =
  "focus-ring w-full rounded-xl border border-hairline bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-gold-line bg-gold-soft text-gold-ink"
          : "border-hairline text-muted hover:border-gold-line hover:text-foreground"
      )}
    >
      {badge !== undefined && (
        <span className="ltr grid size-4 place-items-center rounded-full bg-[var(--gold)] text-[0.625rem] font-bold text-white">
          {badge}
        </span>
      )}
      {children}
    </button>
  );
}

// ─── Step 1 ────────────────────────────────────────────────────────────────
function IdentityStep({
  fullName,
  onFullName,
  birthDate,
  onBirthDate,
  priorities,
  onPriorities,
}: {
  fullName: string;
  onFullName: (v: string) => void;
  birthDate: string;
  onBirthDate: (v: string) => void;
  priorities: LifeAreaKey[];
  onPriorities: (v: LifeAreaKey[]) => void;
}) {
  // Clicking appends to the ranking; clicking again removes and everything
  // after it closes up, so the numbers stay contiguous.
  function toggle(key: LifeAreaKey) {
    onPriorities(priorities.includes(key) ? priorities.filter((k) => k !== key) : [...priorities, key]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="איך לקרוא לך?">
          <input
            value={fullName}
            onChange={(e) => onFullName(e.target.value)}
            placeholder="השם שלך"
            autoFocus
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="תאריך לידה (לא חובה)">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => onBirthDate(e.target.value)}
            className={cn(INPUT_CLASS, "ltr")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">
          מה הכי חשוב לך? לחץ לפי הסדר — הראשון הוא החשוב ביותר
        </span>
        <div className="flex flex-wrap gap-2">
          {LIFE_AREA_LIST.map((area) => {
            const rank = priorities.indexOf(area.key);
            return (
              <Chip
                key={area.key}
                active={rank >= 0}
                badge={rank >= 0 ? rank + 1 : undefined}
                onClick={() => toggle(area.key)}
              >
                {area.label}
              </Chip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 ────────────────────────────────────────────────────────────────
function ChronotypeStep({
  wakeTime,
  onWakeTime,
  sleepTime,
  onSleepTime,
  peakFocus,
  onPeakFocus,
  lowEnergy,
  onLowEnergy,
}: {
  wakeTime: string;
  onWakeTime: (v: string) => void;
  sleepTime: string;
  onSleepTime: (v: string) => void;
  peakFocus: DayPart[];
  onPeakFocus: (v: DayPart[]) => void;
  lowEnergy: DayPart[];
  onLowEnergy: (v: DayPart[]) => void;
}) {
  const toggle = (list: DayPart[], set: (v: DayPart[]) => void) => (key: DayPart) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="שעת קימה">
          <input
            type="time"
            value={wakeTime}
            onChange={(e) => onWakeTime(e.target.value)}
            className={cn(INPUT_CLASS, "ltr")}
          />
        </Field>
        <Field label="שעת שינה">
          <input
            type="time"
            value={sleepTime}
            onChange={(e) => onSleepTime(e.target.value)}
            className={cn(INPUT_CLASS, "ltr")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">מתי אתה בשיא הריכוז?</span>
        <div className="flex flex-wrap gap-2">
          {DAY_PARTS.map((part) => (
            <Chip
              key={part.key}
              active={peakFocus.includes(part.key)}
              onClick={() => toggle(peakFocus, onPeakFocus)(part.key)}
            >
              {part.label}
              <span className="ltr text-[0.625rem] text-muted">{part.range}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">ומתי האנרגיה יורדת?</span>
        <div className="flex flex-wrap gap-2">
          {DAY_PARTS.map((part) => (
            <Chip
              key={part.key}
              active={lowEnergy.includes(part.key)}
              onClick={() => toggle(lowEnergy, onLowEnergy)(part.key)}
            >
              {part.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3 ────────────────────────────────────────────────────────────────
function PeopleStep({
  people,
  onChange,
}: {
  people: DraftPerson[];
  onChange: (v: DraftPerson[]) => void;
}) {
  function update(id: string, patch: Partial<DraftPerson>) {
    onChange(people.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <div className="flex flex-col gap-4">
      {people.map((person) => (
        <div key={person.id} className="flex flex-col gap-3 rounded-xl border border-hairline p-3">
          <div className="flex items-end gap-2">
            <Field label="שם">
              <input
                value={person.name}
                onChange={(e) => update(person.id, { name: e.target.value })}
                placeholder="לדוגמה: רבקה"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="קשר">
              <input
                value={person.relation}
                onChange={(e) => update(person.id, { relation: e.target.value })}
                placeholder="אישה / אח / חבר"
                className={INPUT_CLASS}
              />
            </Field>
            {people.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(people.filter((p) => p.id !== person.id))}
                aria-label={`הסר את ${person.name || "האדם"}`}
                className="focus-ring mb-1 rounded-lg p-2 text-muted transition-colors hover:text-accent-family"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Field label="יום הולדת (MM-DD)">
              <input
                value={person.birthday}
                onChange={(e) => update(person.id, { birthday: e.target.value })}
                placeholder="03-14"
                inputMode="numeric"
                className={cn(INPUT_CLASS, "ltr")}
              />
            </Field>
            <Field label="יום נישואין (MM-DD)">
              <input
                value={person.anniversary}
                onChange={(e) => update(person.id, { anniversary: e.target.value })}
                placeholder="08-22"
                inputMode="numeric"
                className={cn(INPUT_CLASS, "ltr")}
              />
            </Field>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...people, { id: nextDraftId(), name: "", relation: "", birthday: "", anniversary: "" }])
        }
        className="focus-ring inline-flex items-center gap-1.5 self-start rounded-lg text-sm text-gold-ink transition-opacity hover:opacity-80"
      >
        <Plus size={14} aria-hidden />
        הוסף עוד אדם
      </button>
    </div>
  );
}

// ─── Step 4 ────────────────────────────────────────────────────────────────
function GoalsStep({
  goals,
  onGoals,
  habits,
  onHabits,
  habitDraft,
  onHabitDraft,
}: {
  goals: DraftGoal[];
  onGoals: (v: DraftGoal[]) => void;
  habits: string[];
  onHabits: (v: string[]) => void;
  habitDraft: string;
  onHabitDraft: (v: string) => void;
}) {
  function update(id: string, patch: Partial<DraftGoal>) {
    onGoals(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addHabit() {
    const value = habitDraft.trim();
    if (!value || habits.includes(value)) return;
    onHabits([...habits, value]);
    onHabitDraft("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted">היעד המרכזי שלך לשנה הקרובה</span>
        {goals.map((goal) => (
          <div key={goal.id} className="flex flex-col gap-2 rounded-xl border border-hairline p-3">
            <input
              value={goal.title}
              onChange={(e) => update(goal.id, { title: e.target.value })}
              placeholder="לדוגמה: לסיים מסכת שבת"
              className={INPUT_CLASS}
            />
            <div className="flex gap-2">
              <Field label="תחום">
                <select
                  value={goal.category}
                  onChange={(e) => update(goal.id, { category: e.target.value as LifeAreaKey })}
                  className={INPUT_CLASS}
                >
                  {LIFE_AREA_LIST.map((area) => (
                    <option key={area.key} value={area.key} className="bg-background">
                      {area.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="תאריך יעד (לא חובה)">
                <input
                  type="date"
                  value={goal.targetDate}
                  onChange={(e) => update(goal.id, { targetDate: e.target.value })}
                  className={cn(INPUT_CLASS, "ltr")}
                />
              </Field>
              {goals.length > 1 && (
                <button
                  type="button"
                  onClick={() => onGoals(goals.filter((g) => g.id !== goal.id))}
                  aria-label="הסר יעד"
                  className="focus-ring mb-1 self-end rounded-lg p-2 text-muted transition-colors hover:text-accent-family"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onGoals([...goals, { id: nextDraftId(), title: "", category: "faith", targetDate: "" }])}
          className="focus-ring inline-flex items-center gap-1.5 self-start rounded-lg text-sm text-gold-ink transition-opacity hover:opacity-80"
        >
          <Plus size={14} aria-hidden />
          הוסף יעד
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">הרגלים שתרצה לבנות</span>
        <div className="flex gap-2">
          <input
            value={habitDraft}
            onChange={(e) => onHabitDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHabit();
              }
            }}
            placeholder="לדוגמה: ללמוד 20 דקות בבוקר"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addHabit}
            disabled={!habitDraft.trim()}
            className="focus-ring shrink-0 rounded-xl border border-hairline px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            הוסף
          </button>
        </div>
        {habits.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {habits.map((habit) => (
              <span
                key={habit}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold-line bg-gold-soft px-3 py-1.5 text-sm text-gold-ink"
              >
                {habit}
                <button
                  type="button"
                  onClick={() => onHabits(habits.filter((h) => h !== habit))}
                  aria-label={`הסר את ${habit}`}
                  className="focus-ring rounded-full transition-opacity hover:opacity-70"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
