import { timeOfDayFromHour, type TimeOfDay } from "@/lib/greeting";

// Meeting Coordinator (docs/ATLAS_ARCHITECTURE_VISION.md §13): a real,
// deterministic location *category* suggestion based on time of day — never
// a real place lookup (no Places/Maps API key exists in this app, and
// inventing addresses or "nearby" claims would be fabricated data, exactly
// what this app's intelligence layer has never done anywhere else).
const LOCATION_BY_TIME: Record<TimeOfDay, string> = {
  morning: "בית קפה לארוחת בוקר",
  afternoon: "בית קפה או פארק",
  evening: "מסעדה",
  night: "מקום שקט לשיחה",
};

export function suggestMeetupLocationType(hour: number): string {
  return LOCATION_BY_TIME[timeOfDayFromHour(hour)];
}
