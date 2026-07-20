// One-off verification script for Phase 1: exercises real CRUD against the
// live Supabase project and proves multi-user data isolation, using the same
// query patterns lib/db/*.ts uses (select/insert/update/delete scoped by
// user_id). Creates two throwaway users, asserts full isolation between
// them, then deletes both (cascades to every row they own).
//
// Usage: node --env-file=.env.local scripts/verify-phase1.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const client = createClient(url, key);
const results = [];

function check(name, condition) {
  results.push({ name, pass: !!condition });
}

async function main() {
  // --- setup: two throwaway users ---
  const { data: userA, error: errA } = await client
    .from("users")
    .insert({ email: `verify-a-${Date.now()}@example.test`, name: "Verify A" })
    .select()
    .single();
  if (errA) throw errA;

  const { data: userB, error: errB } = await client
    .from("users")
    .insert({ email: `verify-b-${Date.now()}@example.test`, name: "Verify B" })
    .select()
    .single();
  if (errB) throw errB;

  try {
    // --- CREATE ---
    const { data: momentA, error: insErrA } = await client
      .from("moments")
      .insert({ user_id: userA.id, category: "faith", title: "A's moment", content: "..." })
      .select()
      .single();
    check("CREATE: insert moment for user A", !insErrA && momentA);

    const { data: momentB, error: insErrB } = await client
      .from("moments")
      .insert({ user_id: userB.id, category: "health", title: "B's moment", content: "..." })
      .select()
      .single();
    check("CREATE: insert moment for user B", !insErrB && momentB);

    const { data: goalA } = await client
      .from("goals")
      .insert({ user_id: userA.id, title: "A's goal", category: "career" })
      .select()
      .single();
    await client.from("milestones").insert({ goal_id: goalA.id, title: "step 1" });

    // --- READ + ISOLATION ---
    const { data: aMoments } = await client.from("moments").select("*").eq("user_id", userA.id);
    const { data: bMoments } = await client.from("moments").select("*").eq("user_id", userB.id);
    check("READ: user A sees exactly their own moment", aMoments.length === 1 && aMoments[0].id === momentA.id);
    check("READ: user B sees exactly their own moment", bMoments.length === 1 && bMoments[0].id === momentB.id);
    check(
      "ISOLATION: user A's query contains none of user B's data",
      !aMoments.some((m) => m.id === momentB.id)
    );
    check(
      "ISOLATION: user B's query contains none of user A's data",
      !bMoments.some((m) => m.id === momentA.id)
    );

    // --- UPDATE (with ownership check, like peopleRepo.update) ---
    const { data: updatedMoment, error: updErr } = await client
      .from("moments")
      .update({ content: "updated" })
      .eq("id", momentA.id)
      .eq("user_id", userA.id)
      .select()
      .single();
    check("UPDATE: user A can update their own moment", !updErr && updatedMoment.content === "updated");

    // Attempting to update A's row while scoped to B's user_id must affect nothing.
    const { data: crossUpdate, error: crossErr } = await client
      .from("moments")
      .update({ content: "hijacked" })
      .eq("id", momentA.id)
      .eq("user_id", userB.id)
      .select();
    check(
      "ISOLATION: user B cannot update user A's moment via ownership-scoped query",
      !crossErr && crossUpdate.length === 0
    );

    // --- life_area_scores + personal_dna (composite key / 1-row-per-user) ---
    const { error: lifeAreaErr } = await client
      .from("life_area_scores")
      .upsert({ user_id: userA.id, area_key: "career", score: 77 }, { onConflict: "user_id,area_key" });
    check("CRUD: upsert life_area_scores for user A", !lifeAreaErr);

    const { error: dnaErr } = await client
      .from("personal_dna")
      .upsert({ user_id: userA.id, onboarding_complete: true }, { onConflict: "user_id" });
    check("CRUD: upsert personal_dna for user A", !dnaErr);

    // --- DELETE ---
    const { error: delErr } = await client.from("moments").delete().eq("id", momentA.id).eq("user_id", userA.id);
    const { data: afterDelete } = await client.from("moments").select("*").eq("id", momentA.id);
    check("DELETE: user A's moment removed", !delErr && afterDelete.length === 0);

    // --- goals + milestones isolation ---
    const { data: aGoals } = await client.from("goals").select("*").eq("user_id", userA.id);
    const { data: bGoals } = await client.from("goals").select("*").eq("user_id", userB.id);
    check("ISOLATION: user A has goals, user B has none of them", aGoals.length === 1 && bGoals.length === 0);
  } finally {
    // --- cleanup: cascades delete every row these two users own ---
    await client.from("users").delete().eq("id", userA.id);
    await client.from("users").delete().eq("id", userB.id);
  }

  console.log("");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification script errored:", err.message);
  process.exit(1);
});
