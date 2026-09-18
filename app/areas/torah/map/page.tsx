import { Suspense } from "react";
import { KnowledgeMap } from "@/components/features/torah/map/KnowledgeMap";

// מפת הקשרים — the visual knowledge graph. useSearchParams (?focus=book:<id>)
// needs a Suspense boundary above it for static rendering.
export default function TorahMapPage() {
  return (
    <Suspense fallback={null}>
      <KnowledgeMap />
    </Suspense>
  );
}
