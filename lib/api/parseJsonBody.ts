import { NextResponse } from "next/server";
import type { ZodType } from "zod";

type ParseResult<T> = { data: T; error?: undefined } | { data?: undefined; error: NextResponse };

// Shared by every API route that accepts a JSON body (see lib/chat, lib/goals
// route handlers) so "malformed JSON" and "fails schema validation" are
// handled once, consistently, instead of per-route ad hoc `as` casts.
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 }),
    };
  }

  return { data: result.data };
}
