import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { peopleRepo } from "@/lib/db/people";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { toPersonalDNA, toPersonalDnaPatch, toPerson } from "@/lib/mappers";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import {
  ONBOARDING_TOPICS,
  OnboardingExtractionSchema,
  buildOnboardingPrompt,
  buildOnboardingSystemPrompt,
  deriveCoveredTopics,
  isOnboardingComplete,
  isValidBirthday,
  mergePersonalDnaPatch,
} from "@/lib/onboarding/deepOnboarding";
import type { Person, PersonalDNA } from "@/types";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 turns / 5 min — same shape as chat

const onboardingRequestSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .max(40),
  skippedTopics: z.array(z.enum(ONBOARDING_TOPICS)).default([]),
});

const NOT_CONFIGURED_MESSAGE =
  "עדיין אין מפתח AI מחובר, אז נמשיך את ההיכרות הראשונית בטופס הרגיל במקום בשיחה.";
const FRIENDLY_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";

interface OnboardingMessageResult {
  reply: string;
  complete: boolean;
  fallbackToStaticForm: boolean;
  skippedTopics: (typeof ONBOARDING_TOPICS)[number][];
  personalDNA: PersonalDNA;
  newPeople: Person[];
}

function jsonResult(result: OnboardingMessageResult) {
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`onboarding:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, onboardingRequestSchema);
  if (parsed.error) return parsed.error;
  const { history, skippedTopics } = parsed.data;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  const [dnaRow, people] = await Promise.all([personalDnaRepo.get(user.id), peopleRepo.list(user.id)]);
  const existingPersonalDNA = toPersonalDNA(dnaRow);

  if (!isProviderConfigured()) {
    return jsonResult({
      reply: NOT_CONFIGURED_MESSAGE,
      complete: false,
      fallbackToStaticForm: true,
      skippedTopics,
      personalDNA: existingPersonalDNA,
      newPeople: [],
    });
  }

  const turnsAsked = history.filter((turn) => turn.role === "assistant").length;
  const coveredBeforeThisTurn = deriveCoveredTopics(
    { personalDNA: existingPersonalDNA, hasFamily: people.length > 0 },
    skippedTopics
  );

  try {
    const result = await generateStructuredData({
      actor,
      schema: OnboardingExtractionSchema,
      system: buildOnboardingSystemPrompt({
        displayName: user.name,
        covered: coveredBeforeThisTurn,
        turnsAsked,
      }),
      prompt: buildOnboardingPrompt(history),
    });

    const newPeople: Person[] = [];
    for (const person of result.extracted.people) {
      const row = await peopleRepo.insert({
        user_id: user.id,
        name: person.name,
        relation: person.relation,
        birthday: isValidBirthday(person.birthday) ? person.birthday : null,
      });
      newPeople.push(toPerson(row));
    }

    const mergedPatch = mergePersonalDnaPatch(existingPersonalDNA, result.extracted);
    const updatedRow = await personalDnaRepo.upsert(user.id, toPersonalDnaPatch(mergedPatch));
    const updatedPersonalDNA = toPersonalDNA(updatedRow);

    const newSkippedTopics = Array.from(new Set([...skippedTopics, ...result.topicsSkipped]));
    const coveredAfterThisTurn = deriveCoveredTopics(
      { personalDNA: updatedPersonalDNA, hasFamily: people.length + newPeople.length > 0 },
      newSkippedTopics
    );
    const complete = isOnboardingComplete(coveredAfterThisTurn, turnsAsked + 1);

    return jsonResult({
      reply: result.reply,
      complete,
      fallbackToStaticForm: false,
      skippedTopics: newSkippedTopics,
      personalDNA: updatedPersonalDNA,
      newPeople,
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return jsonResult({
      reply: FRIENDLY_ERROR,
      complete: false,
      fallbackToStaticForm: false,
      skippedTopics,
      personalDNA: existingPersonalDNA,
      newPeople: [],
    });
  }
}
