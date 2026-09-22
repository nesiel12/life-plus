// A printable Learning-lab sheet's QR back to the digital topic — the
// Learning OS's analogue of lib/intelligence/crossModule/shabbatQr.ts's
// lessonDigitalUrl, reusing the same encoder (crossModule owns the one QR
// implementation in the app; this only supplies the topic-specific path).

export const TOPIC_PATH_PREFIX = "/areas/learning/topics/";

/** Topic ids are uuids; anything else is refused rather than put in a URL. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function topicDigitalPath(topicId: string): string | null {
  return SAFE_ID.test(topicId) ? `${TOPIC_PATH_PREFIX}${topicId}` : null;
}

export function topicDigitalUrl(baseUrl: string, topicId: string): string | null {
  const path = topicDigitalPath(topicId);
  if (!path) return null;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
