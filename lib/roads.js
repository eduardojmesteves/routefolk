// ============================================================
// routefolk — roads.js
// Supabase CRUD for the `roads` / `road_stage_links` / `road_ratings`
// tables (migration 016). Roads are shared with the whole group — no
// visibility toggle — but ratings and the "My roads" view are per-user.
// ============================================================

import { supabase } from './supabase.js';

/** Fetch the roads the given user has rated (rating >= 1), each carrying
 *  my_rating (that user's own rating), sorted by that rating descending —
 *  HANDOFF.md: "sort order is personal/per-viewer, not... aggregate." */
export async function listMyRoads(userId) {
  if (!userId) return [];
  const { data: ratings, error: ratingsError } = await supabase
    .from('road_ratings')
    .select('road_id, rating')
    .eq('user_id', userId)
    .gte('rating', 1);
  if (ratingsError) throw ratingsError;
  if (!ratings.length) return [];

  const ratingByRoadId = Object.fromEntries(ratings.map((r) => [r.road_id, r.rating]));
  const { data: roads, error: roadsError } = await supabase
    .from('roads')
    .select('*')
    .in('id', ratings.map((r) => r.road_id));
  if (roadsError) throw roadsError;

  return roads
    .map((road) => ({ ...road, my_rating: ratingByRoadId[road.id] || 0 }))
    .sort((a, b) => b.my_rating - a.my_rating);
}

/** Every stage a set of roads is linked to, with enough trip/stage
 *  context to render "Trip title · Stage N · date" rows directly on the
 *  My-roads card (no drill-in, per HANDOFF.md). */
export async function listRoadStageLinks(roadIds) {
  if (!roadIds?.length) return [];
  const { data, error } = await supabase
    .from('road_stage_links')
    .select('id, road_id, stage_id, link_date, stages(id, order_index, start_location, end_location, trip_id, trips(title))')
    .in('road_id', roadIds);
  if (error) throw error;
  return data || [];
}

/** Create a road. created_by is set by trigger. */
export async function createRoad(fields) {
  const payload = {
    road_number_or_name: fields.road_number_or_name?.trim() || '',
    connection_from: fields.connection_from?.trim() || null,
    connection_to: fields.connection_to?.trim() || null,
    notes: fields.notes?.trim() || null,
  };
  const { data, error } = await supabase.from('roads').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** Update a road. */
export async function updateRoad(id, fields) {
  const allowed = ['road_number_or_name', 'connection_from', 'connection_to', 'notes'];
  const clean = {};
  for (const key of allowed) {
    if (key in fields) clean[key] = (fields[key] ?? '').toString().trim() || null;
  }
  const { data, error } = await supabase.from('roads').update(clean).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Delete a road. ON DELETE CASCADE handles its links and ratings. */
export async function deleteRoad(id) {
  const { error } = await supabase.from('roads').delete().eq('id', id);
  if (error) throw error;
}

/** Set the current user's own star rating (1-5) on a road. Explicit
 *  check-then-write rather than a DB upsert, matching this codebase's
 *  simpler write patterns elsewhere. */
export async function rateRoad(roadId, userId, rating) {
  const { data: existing, error: findError } = await supabase
    .from('road_ratings')
    .select('id')
    .eq('road_id', roadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase.from('road_ratings').update({ rating }).eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('road_ratings').insert({ road_id: roadId, rating }).select().single();
  if (error) throw error;
  return data;
}

/** Link a road to a stage. link_date auto-fills from the stage's
 *  planned_date via trigger — the caller never sends one. */
export async function linkRoadToStage(roadId, stageId) {
  const { data, error } = await supabase
    .from('road_stage_links')
    .insert({ road_id: roadId, stage_id: stageId })
    .select('id, road_id, stage_id, link_date, stages(id, order_index, start_location, end_location, trip_id, trips(title))')
    .single();
  if (error) throw error;
  return data;
}

/** Remove a road-stage link. */
export async function unlinkRoadStage(linkId) {
  const { error } = await supabase.from('road_stage_links').delete().eq('id', linkId);
  if (error) throw error;
}
