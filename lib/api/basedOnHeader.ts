// HTTP header values are restricted to Latin-1/ByteString bytes (0-255) —
// the "based on" signal summaries app/api/chat/route.ts sends are real
// Hebrew text, which a header can't carry directly (`Cannot convert
// argument to a ByteString` at runtime, a real bug that shipped and went
// unnoticed until a live AI key finally exercised this path). One shared
// encode/decode pair, not a JSON.stringify() on one side and a bare
// JSON.parse() on the other, so a future write site can't reintroduce the
// same mismatch by forgetting to encode or decode to match.
export function encodeBasedOnHeader(basedOn: string[]): string {
  return encodeURIComponent(JSON.stringify(basedOn));
}

export function decodeBasedOnHeader(header: string | null): string[] {
  if (!header) return [];
  try {
    return JSON.parse(decodeURIComponent(header));
  } catch {
    return [];
  }
}
