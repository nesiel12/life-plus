import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

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
// for anyone who passes the ALLOWED_SIGNIN_EMAILS check (see lib/auth.ts).
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
