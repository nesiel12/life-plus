"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { EntityRef } from "@/lib/summaries/entityRef";

/** Where an EntityRef lives, for navigation out of notes on this page. */
export function useTorahEntityNavigation() {
  const router = useRouter();
  return useCallback(
    (ref: EntityRef) => {
      switch (ref.type) {
        case "book":
          router.push(`/areas/torah/books/${ref.id}`);
          return;
        case "rabbi":
          router.push(`/areas/torah/rabbis/${ref.id}`);
          return;
        case "section":
          router.push(`/areas/torah?section=${ref.id}`);
          return;
        case "person":
          router.push("/areas/family");
          return;
        case "topic":
          return;
      }
    },
    [router]
  );
}

