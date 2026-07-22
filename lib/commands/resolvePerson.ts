// Resolves a spoken name ("אמא", "עודד") from a free-text command to a
// real existing person — never guesses or creates one silently. No match
// means the route reports back honestly ("לא מצאתי איש קשר בשם X") instead
// of fabricating a family-interaction log against the wrong person, or
// against nobody.
export interface ResolvablePerson {
  id: string;
  name: string;
  hebrewName?: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function resolvePersonByName<T extends ResolvablePerson>(people: T[], spokenName: string): T | null {
  const target = normalize(spokenName);
  if (!target) return null;

  const exact = people.find((p) => normalize(p.name) === target || (p.hebrewName && normalize(p.hebrewName) === target));
  if (exact) return exact;

  const partial = people.find(
    (p) => normalize(p.name).includes(target) || (p.hebrewName && normalize(p.hebrewName).includes(target))
  );
  return partial ?? null;
}
