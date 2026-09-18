import "server-only";
import { booksRepo } from "@/lib/db/books";
import { conceptsRepo } from "@/lib/db/concepts";
import { lessonsRepo } from "@/lib/db/lessons";
import { rabbisRepo } from "@/lib/db/rabbis";
import { summariesRepo } from "@/lib/db/summaries";
import { hebrewOnly } from "@/lib/torah/hebrew";
import type { AudioEntityType } from "@/lib/torah/attachments/audio";

// Resolving the entity an attachment hangs off.
//
// entity_audio has no foreign key — it is polymorphic, like kg_edges and
// summaries.entity_type/entity_id — so "does this row exist and is it yours?"
// has to be asked explicitly, on every write. An id in a request body is a
// claim, never a fact: without this check a user could attach a recording to
// (and later read it back from) another account's book id.

export interface ResolvedEntity {
  type: AudioEntityType;
  id: string;
  /** What the widget's header says: the book's Hebrew title, the rabbi's name. */
  label: string;
  /** The page this entity lives on, when it has one. */
  href: string | null;
}

/** The entity, or null when it does not exist for this user. */
export async function resolveAudioEntity(
  userId: string,
  type: AudioEntityType,
  id: string
): Promise<ResolvedEntity | null> {
  switch (type) {
    case "book": {
      const row = await booksRepo.get(userId, id);
      return row
        ? { type, id, label: hebrewOnly(row.hebrew_title) ?? row.title, href: `/areas/torah/books/${id}` }
        : null;
    }
    case "rabbi": {
      const row = await rabbisRepo.get(userId, id);
      return row
        ? { type, id, label: row.hebrew_name?.trim() || row.name, href: `/areas/torah/rabbis/${id}` }
        : null;
    }
    case "lesson": {
      const row = await lessonsRepo.get(userId, id);
      return row ? { type, id, label: row.title, href: `/areas/torah/lessons/${id}` } : null;
    }
    case "concept": {
      const row = await conceptsRepo.get(userId, id);
      return row ? { type, id, label: row.term, href: null } : null;
    }
    case "summary": {
      const row = await summariesRepo.get(userId, id);
      return row ? { type, id, label: row.title, href: "/areas/torah/notes" } : null;
    }
  }
}
