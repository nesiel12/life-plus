import { describe, expect, it } from "vitest";
import { toPersonalDNA, toPersonalDnaPatch } from "@/lib/mappers";
import type { Database } from "@/types/database";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];

function dnaRow(patch: Partial<PersonalDnaRow>): PersonalDnaRow {
  return {
    user_id: "u1",
    peak_focus_hours: null,
    learning_style: null,
    family_check_in_interval_days: null,
    habit_notes: [],
    sleep_notes: null,
    career_notes: null,
    motivation_triggers: [],
    onboarding_complete: false,
    full_name: null,
    birth_date: null,
    chronotype_settings: {},
    core_priorities: [],
    ...patch,
  } as PersonalDnaRow;
}

// jsonb is schemaless coming out of Postgres, and these two columns are read
// on every hydrate. A row hand-edited in the Supabase dashboard, or written by
// an older build, must degrade to empty rather than crash the dashboard.
describe("toPersonalDNA — chronotype parsing", () => {
  it("reads a well-formed object", () => {
    const dna = toPersonalDNA(
      dnaRow({
        chronotype_settings: {
          wakeTime: "06:30",
          sleepTime: "23:00",
          peakFocusHours: ["morning"],
          lowEnergyHours: ["afternoon"],
        },
      })
    );
    expect(dna.chronotype).toEqual({
      wakeTime: "06:30",
      sleepTime: "23:00",
      peakFocusHours: ["morning"],
      lowEnergyHours: ["afternoon"],
    });
  });

  it("falls back to empty for non-object json", () => {
    expect(toPersonalDNA(dnaRow({ chronotype_settings: null })).chronotype).toEqual({});
    expect(toPersonalDNA(dnaRow({ chronotype_settings: "morning" })).chronotype).toEqual({});
    expect(toPersonalDNA(dnaRow({ chronotype_settings: [1, 2] })).chronotype).toEqual({});
  });

  it("drops unknown day parts instead of passing them through", () => {
    const dna = toPersonalDNA(
      dnaRow({ chronotype_settings: { peakFocusHours: ["morning", "brunch", 7] } })
    );
    expect(dna.chronotype.peakFocusHours).toEqual(["morning"]);
  });

  it("treats an all-invalid list as absent", () => {
    const dna = toPersonalDNA(dnaRow({ chronotype_settings: { peakFocusHours: ["brunch"] } }));
    expect(dna.chronotype.peakFocusHours).toBeUndefined();
  });

  it("ignores non-string times", () => {
    const dna = toPersonalDNA(dnaRow({ chronotype_settings: { wakeTime: 630 } }));
    expect(dna.chronotype.wakeTime).toBeUndefined();
  });
});

describe("toPersonalDNA — core priorities parsing", () => {
  it("keeps valid life-area keys in their stored order", () => {
    const dna = toPersonalDNA(dnaRow({ core_priorities: ["career", "faith", "health"] }));
    expect(dna.corePriorities).toEqual(["career", "faith", "health"]);
  });

  it("drops values outside the life-area vocabulary", () => {
    const dna = toPersonalDNA(dnaRow({ core_priorities: ["faith", "growth", null, 4] }));
    expect(dna.corePriorities).toEqual(["faith"]);
  });

  it("dedupes, because order is the ranking", () => {
    // A repeated key would otherwise silently outrank whatever followed it.
    const dna = toPersonalDNA(dnaRow({ core_priorities: ["faith", "family", "faith"] }));
    expect(dna.corePriorities).toEqual(["faith", "family"]);
  });

  it("falls back to empty for non-array json", () => {
    expect(toPersonalDNA(dnaRow({ core_priorities: null })).corePriorities).toEqual([]);
    expect(toPersonalDNA(dnaRow({ core_priorities: { faith: 1 } })).corePriorities).toEqual([]);
  });
});

describe("toPersonalDnaPatch", () => {
  it("omits keys the caller didn't set, so a partial edit can't clobber", () => {
    expect(toPersonalDnaPatch({ fullName: "נסיאל" })).toEqual({ full_name: "נסיאל" });
  });

  it("maps empty strings to null rather than storing blanks", () => {
    expect(toPersonalDnaPatch({ fullName: "", birthDate: "" })).toEqual({
      full_name: null,
      birth_date: null,
    });
  });

  it("passes the structured columns through as json", () => {
    expect(
      toPersonalDnaPatch({ chronotype: { wakeTime: "07:00" }, corePriorities: ["health"] })
    ).toEqual({
      chronotype_settings: { wakeTime: "07:00" },
      core_priorities: ["health"],
    });
  });

  it("round-trips through toPersonalDNA", () => {
    const patch = toPersonalDnaPatch({
      chronotype: { wakeTime: "06:00", peakFocusHours: ["night"] },
      corePriorities: ["faith", "career"],
    });
    const dna = toPersonalDNA(dnaRow(patch as Partial<PersonalDnaRow>));
    expect(dna.chronotype.wakeTime).toBe("06:00");
    expect(dna.chronotype.peakFocusHours).toEqual(["night"]);
    expect(dna.corePriorities).toEqual(["faith", "career"]);
  });
});
