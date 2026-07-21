// Real time-of-day, not a fixed "בוקר טוב" regardless of when the user
// actually opens Atlas. Computed from whatever hour the caller passes in
// (the browser's own local hour, in app/page.tsx — greeting doesn't need
// Personal DNA's Asia/Jerusalem convention since it's read on the user's
// own device, in the user's own timezone).
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

const GREETING_BY_TIME_OF_DAY: Record<TimeOfDay, string> = {
  morning: "בוקר טוב",
  afternoon: "צהריים טובים",
  evening: "ערב טוב",
  night: "לילה טוב",
};

export function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function greetingForHour(hour: number): string {
  return GREETING_BY_TIME_OF_DAY[timeOfDayFromHour(hour)];
}
