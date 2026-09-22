"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { pickFeaturedTopic } from "@/lib/learning/featured";
import { TopicTile, type Spotlight } from "@/components/features/learning/TopicTile";
import type { LearningResource, LearningTopic } from "@/types";

interface TopicCollectionProps {
  topics: readonly LearningTopic[];
  resources: readonly LearningResource[];
  /** The topic the shuffle is on, or landed on. */
  litId: string | null;
  onOpen: (topicId: string) => void;
}

const CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

function spotlightFor(id: string, litId: string | null): Spotlight {
  if (litId === null) return "none";
  return id === litId ? "lit" : "dimmed";
}

/**
 * The topics as an animated bento: the topic you are partway through runs wide,
 * and the rest tile around it. Tiles cascade in with `staggerChildren: 0.05` on a spring.
 */
export function TopicGrid({ topics, resources, litId, onOpen }: TopicCollectionProps) {
  const featuredId = useMemo(() => pickFeaturedTopic(topics, resources), [topics, resources]);

  return (
    // `dense` so a wide card in the middle does not leave a hole beside it.
    <motion.div
      variants={CONTAINER}
      initial="hidden"
      animate="show"
      className="grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {topics.map((topic) => (
        <TopicTile
          key={topic.id}
          topic={topic}
          resources={resources.filter((r) => r.topicId === topic.id)}
          variant="card"
          wide={topic.id === featuredId && topics.length >= 3}
          spotlight={spotlightFor(topic.id, litId)}
          onOpen={onOpen}
        />
      ))}
    </motion.div>
  );
}

/** The same topics, one per row — the syllabus view. Cards morph into these and back. */
export function TopicList({ topics, resources, litId, onOpen }: TopicCollectionProps) {
  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="flex flex-col gap-2.5">
      {topics.map((topic) => (
        <TopicTile
          key={topic.id}
          topic={topic}
          resources={resources.filter((r) => r.topicId === topic.id)}
          variant="row"
          spotlight={spotlightFor(topic.id, litId)}
          onOpen={onOpen}
        />
      ))}
    </motion.div>
  );
}
