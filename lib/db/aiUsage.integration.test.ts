import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

// Quota enforcement, against the real Postgres function.
//
// Deliberately not mocked. The entire reason consume_ai_units exists in the
// database rather than in TypeScript is concurrency, and a mock cannot
// demonstrate that forty parallel callers do not all pass the same check. A
// test that stubs the function would assert only that the mock behaves the
// way I imagined the real one does — which is precisely the assumption worth
// testing.
//
// Skipped when SUPABASE_DB_URL is absent so the suite stays green on a
// machine with no database, rather than failing for an unrelated reason.

function dbUrl(): string | undefined {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  // vitest does not load .env.local the way the npm scripts do.
  if (!existsSync(".env.local")) return undefined;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*SUPABASE_DB_URL\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const URL = dbUrl();
const suite = URL ? describe : describe.skip;

suite("consume_ai_units (real database)", () => {
  let client: Client;
  const userIds: string[] = [];

  /** A throwaway user, because ai_usage.user_id is a real foreign key. */
  async function makeUser(): Promise<string> {
    const email = `quota-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
    const { rows } = await client.query<{ id: string }>(
      "insert into users (email, name) values ($1, $2) returning id",
      [email, "Quota Test"]
    );
    userIds.push(rows[0].id);
    return rows[0].id;
  }

  function budget(scope: string, cost: number, limit: number, window = "2030-01-01T00:00:00Z") {
    return { scope, window, cost, limit };
  }

  async function consume(userId: string, budgets: unknown[]) {
    const { rows } = await client.query(
      "select * from consume_ai_units($1::uuid, $2::jsonb)",
      [userId, JSON.stringify(budgets)]
    );
    return rows[0] as { allowed: boolean; rejected_scope: string | null; used: number | null };
  }

  beforeAll(async () => {
    client = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });

  afterAll(async () => {
    if (userIds.length) {
      // ai_usage cascades from users, so this cleans both.
      await client.query("delete from users where id = any($1::uuid[])", [userIds]);
    }
    await client.end();
  });

  it("allows a user under their daily quota", async () => {
    const user = await makeUser();
    const result = await consume(user, [budget("day", 1, 40)]);
    expect(result.allowed).toBe(true);
  });

  it("accumulates across calls", async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i++) await consume(user, [budget("day", 1, 40)]);
    const { rows } = await client.query<{ units: number }>(
      "select units from ai_usage where user_id = $1 and scope = 'day'",
      [user]
    );
    expect(Number(rows[0].units)).toBe(3);
  });

  it("rejects the request that would cross the limit", async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i++) {
      expect((await consume(user, [budget("day", 1, 3)])).allowed).toBe(true);
    }
    const over = await consume(user, [budget("day", 1, 3)]);
    expect(over.allowed).toBe(false);
    expect(over.rejected_scope).toBe("day");
  });

  it("does not charge a rejected request", async () => {
    const user = await makeUser();
    await consume(user, [budget("day", 2, 2)]);
    await consume(user, [budget("day", 2, 2)]); // rejected
    const { rows } = await client.query<{ units: number }>(
      "select units from ai_usage where user_id = $1 and scope = 'day'",
      [user]
    );
    expect(Number(rows[0].units)).toBe(2);
  });

  it("respects a heavier cost, rejecting when it would overshoot", async () => {
    const user = await makeUser();
    expect((await consume(user, [budget("day", 3, 5)])).allowed).toBe(true);
    // 3 + 3 > 5, so this must not squeeze through.
    expect((await consume(user, [budget("day", 3, 5)])).allowed).toBe(false);
  });

  // The reason this lives in the database at all.
  it("cannot be bypassed by concurrent requests", async () => {
    const user = await makeUser();
    const LIMIT = 5;
    const ATTEMPTS = 40;

    // A pool rather than a client per attempt: the Supabase pooler caps a
    // session at 15 clients, and forty of them just fails to connect —
    // which would look like a passing test for the wrong reason. Ten real
    // connections racing for five slots is the actual contention this
    // guards against, and the pool keeps all forty queries in flight.
    const pool = new Pool({
      connectionString: URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });

    try {
      const results = await Promise.all(
        Array.from({ length: ATTEMPTS }, async () => {
          const { rows } = await pool.query(
            "select * from consume_ai_units($1::uuid, $2::jsonb)",
            [user, JSON.stringify([budget("day", 1, LIMIT)])]
          );
          return rows[0].allowed as boolean;
        })
      );

      // Exactly the limit, never more: the whole guarantee in one assertion.
      expect(results.filter(Boolean)).toHaveLength(LIMIT);
      expect(results.filter((r) => !r)).toHaveLength(ATTEMPTS - LIMIT);
    } finally {
      await pool.end();
    }

    const { rows } = await client.query<{ units: number }>(
      "select units from ai_usage where user_id = $1 and scope = 'day'",
      [user]
    );
    expect(Number(rows[0].units)).toBe(LIMIT);
  }, 60_000);

  it("enforces the burst budget independently of the daily one", async () => {
    const user = await makeUser();
    const both = (n: number) => [budget("day", 1, 100), budget("minute", 1, n)];
    for (let i = 0; i < 2; i++) expect((await consume(user, both(2))).allowed).toBe(true);
    const throttled = await consume(user, both(2));
    expect(throttled.allowed).toBe(false);
    expect(throttled.rejected_scope).toBe("minute");
  });

  it("charges nothing at all when one of several budgets is exhausted", async () => {
    const user = await makeUser();
    await consume(user, [budget("day", 1, 100), budget("minute", 1, 1)]);
    // Burst is full; the daily budget must not be charged for the refusal.
    await consume(user, [budget("day", 1, 100), budget("minute", 1, 1)]);
    const { rows } = await client.query<{ scope: string; units: number }>(
      "select scope, units from ai_usage where user_id = $1 order by scope",
      [user]
    );
    const byScope = Object.fromEntries(rows.map((r) => [r.scope, Number(r.units)]));
    expect(byScope.day).toBe(1);
    expect(byScope.minute).toBe(1);
  });

  it("enforces the transcription budget in audio minutes", async () => {
    const user = await makeUser();
    expect((await consume(user, [budget("transcribe_day", 7, 10)])).allowed).toBe(true);
    const over = await consume(user, [budget("transcribe_day", 7, 10)]);
    expect(over.allowed).toBe(false);
    expect(over.rejected_scope).toBe("transcribe_day");
  });

  it("keeps each user's quota independent", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    for (let i = 0; i < 3; i++) await consume(a, [budget("day", 1, 3)]);
    expect((await consume(a, [budget("day", 1, 3)])).allowed).toBe(false);
    // b has spent nothing and must be unaffected by a exhausting theirs.
    expect((await consume(b, [budget("day", 1, 3)])).allowed).toBe(true);
  });

  it("keeps windows independent, so a new day starts clean", async () => {
    const user = await makeUser();
    await consume(user, [budget("day", 3, 3, "2030-01-01T00:00:00Z")]);
    expect((await consume(user, [budget("day", 1, 3, "2030-01-01T00:00:00Z")])).allowed).toBe(false);
    expect((await consume(user, [budget("day", 1, 3, "2030-01-02T00:00:00Z")])).allowed).toBe(true);
  });

  it("refuses everything when the limit is zero", async () => {
    const user = await makeUser();
    expect((await consume(user, [budget("day", 1, 0)])).allowed).toBe(false);
  });

  describe("adjust_ai_units", () => {
    it("settles a reservation upward", async () => {
      const user = await makeUser();
      await consume(user, [budget("transcribe_day", 3, 100)]);
      await client.query("select adjust_ai_units($1::uuid, 'transcribe_day', $2::timestamptz, 2)", [
        user,
        "2030-01-01T00:00:00Z",
      ]);
      const { rows } = await client.query<{ units: number }>(
        "select units from ai_usage where user_id = $1 and scope = 'transcribe_day'",
        [user]
      );
      expect(Number(rows[0].units)).toBe(5);
    });

    it("settles downward when the estimate overshot", async () => {
      const user = await makeUser();
      await consume(user, [budget("transcribe_day", 5, 100)]);
      await client.query("select adjust_ai_units($1::uuid, 'transcribe_day', $2::timestamptz, -3)", [
        user,
        "2030-01-01T00:00:00Z",
      ]);
      const { rows } = await client.query<{ units: number }>(
        "select units from ai_usage where user_id = $1 and scope = 'transcribe_day'",
        [user]
      );
      expect(Number(rows[0].units)).toBe(2);
    });

    // A refund larger than the balance would otherwise hand out free quota.
    it("never drives the counter negative", async () => {
      const user = await makeUser();
      await consume(user, [budget("transcribe_day", 1, 100)]);
      await client.query("select adjust_ai_units($1::uuid, 'transcribe_day', $2::timestamptz, -99)", [
        user,
        "2030-01-01T00:00:00Z",
      ]);
      const { rows } = await client.query<{ units: number }>(
        "select units from ai_usage where user_id = $1 and scope = 'transcribe_day'",
        [user]
      );
      expect(Number(rows[0].units)).toBe(0);
    });
  });
});
