import Image from "next/image";
import type { Person } from "@/types";

// Deterministic, not random — the same person always gets the same color
// across renders/sessions, and reuses the app's own five life-area accent
// tokens rather than inventing a sixth palette just for avatars.
const ACCENT_VARS = ["--accent-faith", "--accent-family", "--accent-knowledge", "--accent-health", "--accent-career"];

function hashToAccent(id: string): string {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return ACCENT_VARS[sum % ACCENT_VARS.length];
}

function initialFor(person: Person): string {
  const name = (person.hebrewName ?? person.name).trim();
  return name.charAt(0).toUpperCase() || "?";
}

interface PersonAvatarProps {
  person: Person;
  size?: number;
  className?: string;
}

// A sleek circular avatar (Family CRM upgrade): the person's real photo
// when one was uploaded (person.avatarUrl — a client-side-resized data
// URL, see the migration for why not a storage bucket), otherwise a
// deterministic-colored initial instead of a generic gray silhouette, so
// the empty state still looks intentional and each person reads as
// visually distinct at a glance, matching this app's "no fabricated
// placeholder" discipline (a real initial from their real name, not a
// stock icon).
export function PersonAvatar({ person, size = 44, className }: PersonAvatarProps) {
  if (person.avatarUrl) {
    return (
      <Image
        src={person.avatarUrl}
        alt={person.hebrewName ?? person.name}
        width={size}
        height={size}
        unoptimized
        className={`rounded-full object-cover ring-1 ring-glass-border ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const accentVar = hashToAccent(person.id);
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-medium ring-1 ring-glass-border ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: `color-mix(in srgb, var(${accentVar}) 28%, transparent)`,
        color: `var(${accentVar})`,
      }}
      aria-hidden
    >
      {initialFor(person)}
    </div>
  );
}
