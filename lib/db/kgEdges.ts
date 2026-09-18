import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database, KgNodeTypeDb, KgRelationDb } from "@/types/database";
import type { KgEdge, KgNodeRef, KgRelation } from "@/lib/torah/graph";

type KgEdgeRow = Database["public"]["Tables"]["kg_edges"]["Row"];
type KgEdgeInsert = Database["public"]["Tables"]["kg_edges"]["Insert"];

const base = createUserScopedRepo("kg_edges");

/** Row → the pure shape lib/torah/graph.ts traverses. */
export function toKgEdge(row: KgEdgeRow): KgEdge {
  return {
    id: row.id,
    fromType: row.from_type,
    fromId: row.from_id,
    toType: row.to_type,
    toId: row.to_id,
    relation: row.relation,
    weight: row.weight,
    origin: row.origin,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
  };
}

export const kgEdgesRepo = {
  ...base,

  list: (userId: string) => base.list(userId, { orderBy: "created_at", ascending: true }),

  /**
   * Writes edges without creating duplicates.
   *
   * Every producer of edges here is re-runnable — re-extracting sources from
   * a lesson, re-syncing a book from Sefaria, re-saving a summary whose
   * @mentions changed. Without an upsert each of those stacks a second
   * identical edge every time it runs, and the graph screen slowly fills with
   * parallel lines between the same two nodes.
   *
   * The conflict target is the unique index from the migration. `ignoreDuplicates`
   * is false so a re-run can *correct* an edge: a citation the model was 40%
   * sure of last week, and is 90% sure of now, should end up at 90%.
   */
  async upsertMany(rows: KgEdgeInsert[]): Promise<KgEdgeRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("kg_edges")
      .upsert(rows, {
        onConflict: "user_id,from_type,from_id,relation,to_type,to_id",
        ignoreDuplicates: false,
      })
      .select();
    if (error) throw error;
    return data ?? [];
  },

  /** Every edge touching a node, in either direction. */
  async listForNode(userId: string, node: KgNodeRef): Promise<KgEdgeRow[]> {
    const client = getSupabaseClient();

    // Two queries rather than one `.or(...)`: PostgREST's or() takes a filter
    // string built by concatenation, and node ids here include user-authored
    // topic labels — which can contain the commas and parentheses that string
    // is delimited by. Two parameterised queries cannot be broken that way.
    const [outgoing, incoming] = await Promise.all([
      client
        .from("kg_edges")
        .select("*")
        .eq("user_id", userId)
        .eq("from_type", node.type)
        .eq("from_id", node.id),
      client
        .from("kg_edges")
        .select("*")
        .eq("user_id", userId)
        .eq("to_type", node.type)
        .eq("to_id", node.id),
    ]);

    if (outgoing.error) throw outgoing.error;
    if (incoming.error) throw incoming.error;

    const seen = new Set<string>();
    return [...(outgoing.data ?? []), ...(incoming.data ?? [])].filter((row) => {
      // A self-loop comes back from both queries.
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  },

  /**
   * Deep traversal, run in Postgres.
   *
   * For anything past a couple of hops — a chain of transmission, a citation
   * tree — this beats fetching the edge list and walking it in Node, because
   * it returns only the branch asked for. The shallow cases (a node's
   * neighbours, the subgraph behind the map) stay in lib/torah/graph.ts,
   * which needs no round trip at all once edges are loaded.
   */
  async walk(
    userId: string,
    start: KgNodeRef,
    options: { relations?: KgRelation[]; maxDepth?: number } = {}
  ) {
    const { data, error } = await getSupabaseClient().rpc("kg_walk", {
      p_user_id: userId,
      p_start_type: start.type satisfies KgNodeTypeDb,
      p_start_id: start.id,
      p_relations: (options.relations as KgRelationDb[] | undefined) ?? null,
      p_max_depth: options.maxDepth ?? 4,
    });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Removes every edge produced by one source.
   *
   * Used before re-extracting a lesson: the old AI-derived edges for that
   * lesson go, the user's own hand-drawn ones stay. Without the origin filter
   * a re-run would silently delete links the user drew themselves.
   */
  async removeAiEdgesFrom(userId: string, node: KgNodeRef): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("kg_edges")
      .delete()
      .eq("user_id", userId)
      .eq("from_type", node.type)
      .eq("from_id", node.id)
      .eq("origin", "ai");
    if (error) throw error;
  },
};
