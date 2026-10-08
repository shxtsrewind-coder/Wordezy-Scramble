// Local save for what's inherently per-device: today's in-progress puzzle,
// the win streak, the Classic Unlimited unlock flag, and the stats
// achievements are computed from. Identity and leaderboard standing live in
// Supabase (lib/supabase.ts ensureSession + lib/leaderboard.ts).

const KEY = "wordezyScramble.save.v1";

/** Today's daily run. Kept in storage so a reload mid-puzzle neither resets
 *  the clock nor deals the same words again from a fresh start. */
export interface DailyProgress {
  date: string;
  /** Wall-clock start (ms since epoch), set when the player presses Play. */
  startedAt: number;
  /** Index of the round being played; equals the round count once finished. */
  round: number;
  /** Hints used on each round (each locks one more leading letter in place). */
  hints: number[];
  /** Final time including hint penalties, once all rounds are solved. */
  finishedMs: number | null;
}

export interface SaveData {
  lastSolvedDate: string | null;
  streak: number;
  maxStreak: number;
  totalDailyWins: number;
  /** Daily wins with no hints at all. */
  cleanWins: number;
  bestDailyTimeMs: number | null;
  unlockedUnlimited: boolean;
  displayName: string | null;
  unlockedAchievements: string[];
  daily: DailyProgress | null;
}

const DEFAULTS: SaveData = {
  lastSolvedDate: null,
  streak: 0,
  maxStreak: 0,
  totalDailyWins: 0,
  cleanWins: 0,
  bestDailyTimeMs: null,
  unlockedUnlimited: false,
  displayName: null,
  unlockedAchievements: [],
  daily: null,
};

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
}

export const localSave = {
  get: read,

  startDaily(date: string, roundCount: number): SaveData {
    const data = read();
    data.daily = { date, startedAt: Date.now(), round: 0, hints: Array(roundCount).fill(0), finishedMs: null };
    write(data);
    return data;
  },

  updateDaily(patch: Partial<DailyProgress>): SaveData {
    const data = read();
    if (data.daily) data.daily = { ...data.daily, ...patch };
    write(data);
    return data;
  },

  /** Records a finished daily: streak, stats and best time. Counts once per
   *  calendar day. */
  recordDailyWin(date: string, timeMs: number, totalHints: number): SaveData {
    const data = read();
    if (data.daily && data.daily.date === date) data.daily.finishedMs = timeMs;

    if (data.lastSolvedDate !== date) {
      const yesterday = new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
      data.streak = data.lastSolvedDate === yesterday ? data.streak + 1 : 1;
      data.lastSolvedDate = date;
      data.maxStreak = Math.max(data.maxStreak, data.streak);
      data.totalDailyWins += 1;
      if (totalHints === 0) data.cleanWins += 1;
      data.bestDailyTimeMs = data.bestDailyTimeMs === null ? timeMs : Math.min(data.bestDailyTimeMs, timeMs);
    }
    write(data);
    return data;
  },

  setUnlockedAchievements(ids: string[]): SaveData {
    const data = read();
    data.unlockedAchievements = ids;
    write(data);
    return data;
  },

  /** Placeholder until a real payment processor is wired up — never call
   *  this from anywhere except a confirmed, server-verified purchase. */
  setUnlocked(value: boolean): SaveData {
    const data = read();
    data.unlockedUnlimited = value;
    write(data);
    return data;
  },

  setDisplayName(name: string): SaveData {
    const data = read();
    data.displayName = name.trim().slice(0, 20) || null;
    write(data);
    return data;
  },
};
