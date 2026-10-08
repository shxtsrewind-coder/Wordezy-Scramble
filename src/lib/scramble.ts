import { ANSWERS_BY_LENGTH, ALSO_ACCEPTED } from "../data/words.ts";
import { makeRng } from "./rng.ts";

/** One word per length, shortest first, so each puzzle ramps from a quick
 *  warm-up to a real think. */
export const ROUND_LENGTHS = [4, 5, 6, 7, 8] as const;

/** Each "reveal letter" hint adds this much to the daily time — hints are
 *  unlimited so nobody gets stuck, but they can't buy a fast leaderboard time. */
export const HINT_PENALTY_MS = 10_000;

export interface Round {
  answer: string;
  scrambled: string;
  /** Other real words made from the same letters, also counted as correct. */
  accepted: string[];
}

export interface Puzzle {
  /** UTC date for the daily puzzle, or a unique seed for an Unlimited set. */
  id: string;
  rounds: Round[];
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shuffleOnce(letters: string[], rng: () => number): string[] {
  const a = [...letters];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Scrambles a word so it never comes out as the answer (or another accepted
 *  word), preferring the arrangement with the fewest letters left in their
 *  original spot — "ROCKTE" for ROCKET would be no puzzle at all. */
export function scrambleWord(word: string, rng: () => number, accepted: string[] = []): string {
  const banned = new Set([word, ...accepted]);
  let best = "";
  let bestFixed = Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = shuffleOnce(word.split(""), rng).join("");
    if (banned.has(candidate)) continue;
    let fixed = 0;
    for (let i = 0; i < word.length; i++) if (candidate[i] === word[i]) fixed++;
    if (fixed < bestFixed) {
      best = candidate;
      bestFixed = fixed;
      if (fixed === 0) break;
    }
  }
  // Only reachable for words with almost no distinct arrangements; reversing
  // still guarantees it isn't the answer as written.
  return best || word.split("").reverse().join("");
}

function buildPuzzle(id: string, rng: () => number): Puzzle {
  const rounds = ROUND_LENGTHS.map((len) => {
    const pool = ANSWERS_BY_LENGTH[len];
    const answer = pool[Math.floor(rng() * pool.length)];
    const accepted = ALSO_ACCEPTED[answer] ?? [];
    return { answer, scrambled: scrambleWord(answer, rng, accepted), accepted };
  });
  return { id, rounds };
}

/** Same five words for every player on a given UTC day — the date is the
 *  only input, so there's nothing to fetch to agree on today's puzzle. */
export function getDailyPuzzle(date: string = todayUtc()): Puzzle {
  return buildPuzzle(date, makeRng(`scramble:daily:${date}`));
}

/** Classic Unlimited: a fresh set every time. */
export function getRandomPuzzle(): Puzzle {
  const seed = `scramble:random:${Date.now()}:${Math.random()}`;
  return buildPuzzle(seed, makeRng(seed));
}

export function isCorrectGuess(guess: string, round: Round): boolean {
  const g = guess.toLowerCase();
  return g === round.answer || round.accepted.includes(g);
}

/** Milliseconds until the next daily puzzle (midnight UTC). */
export function msUntilNextPuzzle(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - now;
}
