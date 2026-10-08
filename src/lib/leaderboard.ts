// Daily leaderboard — backed by Supabase (the project shared with Wordezy and
// Wordezy Search; see supabase/migrations for the wordezy_scramble_* tables).
// Writes go through a SECURITY DEFINER RPC that reads the player's identity
// and display name from the authenticated session, never from the client.
import { supabase } from "./supabase.ts";

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  timeMs: number;
  hints: number;
  isYou: boolean;
}

/** Records the signed-in player's finish for a puzzle date. Only the first
 *  finish of the day counts — the RPC ignores any later submission. */
export async function submitScore(opts: { puzzleDate: string; timeMs: number; hints: number }): Promise<void> {
  const { error } = await supabase.rpc("submit_wordezy_scramble_score", {
    p_puzzle_date: opts.puzzleDate,
    p_time_ms: Math.max(1, Math.round(opts.timeMs)),
    p_hints: opts.hints,
  });
  if (error) throw error;
}

/** Returns this game's display name for the signed-in player, copying it
 *  over from Wordezy Search / Wordezy the first time an existing account
 *  plays. Null for guests who haven't picked a name. */
export async function ensureProfile(): Promise<string | null> {
  const { data, error } = await supabase.rpc("wordezy_scramble_ensure_profile");
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function getDailyLeaderboard(
  puzzleDate: string,
  currentPlayerId: string | null,
  limit = 10
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("wordezy_scramble_daily_leaderboard", {
    p_puzzle_date: puzzleDate,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: { player_id: string; display_name: string; time_ms: number; hints: number }) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    timeMs: row.time_ms,
    hints: row.hints,
    isYou: row.player_id === currentPlayerId,
  }));
}

export interface AllTimeLeaderboardEntry {
  playerId: string;
  displayName: string;
  wins: number;
  bestTimeMs: number;
  isYou: boolean;
}

/** All-time standings, ranked by total daily wins, best time as tiebreaker. */
export async function getAllTimeLeaderboard(
  currentPlayerId: string | null,
  limit = 10
): Promise<AllTimeLeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("wordezy_scramble_alltime_leaderboard", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row: { player_id: string; display_name: string; wins: number; best_time_ms: number }) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    wins: Number(row.wins),
    bestTimeMs: row.best_time_ms,
    isYou: row.player_id === currentPlayerId,
  }));
}
