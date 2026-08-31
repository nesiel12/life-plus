import type { OnboardingQuestion } from "@/types";

export const APP_NAME = "Life Plus";

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "peakFocusHours",
    prompt: "באילו שעות ביום אתה מרגיש הכי מרוכז וערני?",
  },
  {
    id: "learningStyle",
    prompt: "איך אתה הכי אוהב ללמוד — לבד מתוך טקסט, בהאזנה, או בשיחה עם מישהו?",
  },
  {
    id: "familyCheckInIntervalDays",
    prompt: "כל כמה ימים בערך תרצה שאזכיר לך ליצור קשר משמעותי עם המשפחה?",
  },
];
