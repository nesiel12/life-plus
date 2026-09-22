"use client";

import { BackToHome } from "@/components/layout/BackToHome";
import { LearningHub } from "@/components/features/learning/LearningHub";

// The learning space is a lab: search, add, shuffle and explore topics as a grid,
// a map or a list, and open any of them into a full canvas with its video, its
// quest and a tutor. All of that lives in LearningHub; this page is its frame.
export default function LearningSpacePage() {
  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <LearningHub />
    </main>
  );
}
