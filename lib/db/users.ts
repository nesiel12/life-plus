import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

/** Every user id — used by the Proactive Engine to fan a per-user job out. */
export async function listAllUserIds(): Promise<string[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("users").select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Called from the NextAuth signIn/jwt callback so a users row always exists
// for anyone who signs in. Sign-up is open (see lib/auth.ts), so this is the
// provisioning path for every new account, not just a pre-approved few.
export async function getOrCreateUserByEmail(
  email: string,
  defaults: { name: string; image?: string | null }
): Promise<UserRow> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("users")
    .insert({ email: email.toLowerCase(), name: defaults.name })
    .select()
    .single();
  if (error) throw error;
  return data;
}
