import { TEACHING_MODES, USER_AGE_GROUPS, type TeachingMode, type UserAgeGroup } from "@/types/learning";

// The classroom's two remembered pickers. Shared by LessonViewport and the
// hover prefetch, which must ask for the exact variant the viewport will open.

const AGE_GROUP_KEY = "lifeplus.masterclass.ageGroup";
const TEACHING_MODE_KEY = "lifeplus.masterclass.teachingMode";

export const DEFAULT_AGE_GROUP: UserAgeGroup = "ADULTS_19_PLUS";
export const DEFAULT_TEACHING_MODE: TeachingMode = "STORYTELLING";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the picker still works for this session, just not remembered
  }
}

export const readStoredAgeGroup = () => readStored(AGE_GROUP_KEY, USER_AGE_GROUPS, DEFAULT_AGE_GROUP);
export const readStoredTeachingMode = () => readStored(TEACHING_MODE_KEY, TEACHING_MODES, DEFAULT_TEACHING_MODE);
export const storeAgeGroup = (value: UserAgeGroup) => writeStored(AGE_GROUP_KEY, value);
export const storeTeachingMode = (value: TeachingMode) => writeStored(TEACHING_MODE_KEY, value);
