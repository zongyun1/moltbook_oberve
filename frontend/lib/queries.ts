/**
 * Supabase query helpers for the dashboard.
 * Each function maps to a specific dashboard widget.
 */

import { getSupabase } from "./supabase";

export async function getLatestSnapshot() {
  const { data } = await getSupabase()
    .from("v_latest_snapshot")
    .select("*")
    .limit(1)
    .single();
  return data;
}

export async function getSnapshotHistory(limit = 30) {
  const { data } = await getSupabase()
    .from("v_snapshot_history")
    .select("*")
    .limit(limit);
  return data || [];
}

export async function getArchetypeCounts() {
  const { data } = await getSupabase()
    .from("v_archetype_counts")
    .select("*");
  return data || [];
}

export async function getMetrics(snapshotId: string, category?: string) {
  let query = getSupabase()
    .from("metrics")
    .select("*")
    .eq("snapshot_id", snapshotId);

  if (category) {
    query = query.eq("category", category);
  }

  const { data } = await query;
  return data || [];
}

export async function getGeometryDistribution(snapshotId: string) {
  const { data } = await getSupabase()
    .from("thread_geometry")
    .select("size, depth, width, mean_branching, archetype")
    .eq("snapshot_id", snapshotId);
  return data || [];
}

export async function getTopAuthors(snapshotId: string, limit = 20) {
  const { data } = await getSupabase()
    .rpc("top_authors", { p_snapshot_id: snapshotId, p_limit: limit });
  return data || [];
}
