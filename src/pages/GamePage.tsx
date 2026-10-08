import React, { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Sparkles,
  RefreshCw,
  Flame,
  Timer as TimerIcon,
  WifiOff,
  Award,
  Play,
  Share2,
  Check,
  Lightbulb,
  Shuffle,
  Keyboard,
} from "lucide-react";
import { ScrambleBoard } from "../components/ScrambleBoard.tsx";
import { Leaderboard } from "../components/Leaderboard.tsx";
import { AuthModal } from "../components/AuthModal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { AchievementToastStack } from "../components/AchievementToast.tsx";
import { AchievementsModal } from "../components/AchievementsModal.tsx";
import {
  getDailyPuzzle,
  getRandomPuzzle,
  todayUtc,
  msUntilNextPuzzle,
  HINT_PENALTY_MS,
  ROUND_LENGTHS,
  type Puzzle,
} from "../lib/scramble.ts";
import { localSave, type DailyProgress } from "../lib/localSave.ts";
import { submitScore, ensureProfile } from "../lib/leaderboard.ts";
import { supabase, ensureSession } from "../lib/supabase.ts";
import { useElapsed, formatTime, formatCountdown } from "../hooks/useTimer.ts";
import { ACHIEVEMENTS, diffNewlyUnlocked, type Achievement } from "../data/achievements.ts";
import { buildShareText, shareResult } from "../lib/share.ts";

type Mode = "daily" | "unlimited";
type Phase = "auth_checking" | "choice" | "ready" | "auth_blocked";

/** Shown once per browser session — a returning guest isn't re-prompted on
 *  every reload, only on a fresh session. */
const PLAY_CHOICE_KEY = "wordezyScramble.playChoice";

const OTHER_GAMES = [
  { name: "Wordezy", url: "https://wordezy.bgameworld.com/" },
  { name: "Wordezy Search", url: "https://wordezysearch.bgameworld.com/" },
  { name: "When & Where", url: "https://whenandwhere.bgameworld.com/" },
];

/** The brand tiles, dealt out of order — this is the scramble game. */
const WordmarkTiles: React.FC<{ className?: string }> = ({ className = "flex" }) => (
  <div className={`${className} items-center gap-1`} aria-hidden="true">
    {["D", "R", "O", "W"].map((letter, i) => (
      <span
        key={i}
        className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-display font-semibold text-[11px] ${
          i % 2 === 0 ? "bg-correct text-ink" : "bg-present text-ink"
        } ${i === 1 ? "-rotate-6" : i === 2 ? "rotate-6" : ""}`}
      >
        {letter}
      </span>
    ))}
  </div>
);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** One pip per word: green when solved clean, gold when hints were used. */
const RoundPips: React.FC<{ current: number; hints: number[]; done: boolean }> = ({ current, hints, done }) => (
  <div className="flex items-center gap-1.5" aria-label={`Word ${Math.min(current + 1, ROUND_LENGTHS.length)} of ${ROUND_LENGTHS.length}`}>
    {ROUND_LENGTHS.map((len, i) => {
      const solved = done || i < current;
      const tone = solved
        ? hints[i] > 0
          ? "bg-present text-ink border-present"
          : "bg-correct text-ink border-correct"
        : i === current
        ? "border-paper/70 text-paper"
        : "border-rule text-faint";
      return (
        <span
          key={len}
          className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold ${tone}`}
          title={`${len} letters`}
        >
          {len}
        </span>
      );
    })}
  </div>
);

export const GamePage: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("auth_checking");
  const [authBlockedReason, setAuthBlockedReason] = useState<"anonymous_disabled" | "unknown">("unknown");
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Player");
  /** Whether this player has a name for this game — the leaderboard RPC
   *  needs one, so guests who never picked a name aren't submitted. */
  const [hasProfile, setHasProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [mode, setMode] = useState<Mode>("daily");
  const [save, setSave] = useState(() => localSave.get());
  const [today] = useState(() => todayUtc());
  const [daily] = useState(() => getDailyPuzzle(today));

  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [scoreStatus, setScoreStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [showAchievements, setShowAchievements] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  // Classic Unlimited lives in memory only — every set is fresh anyway.
  const [unlimited, setUnlimited] = useState<Puzzle>(() => getRandomPuzzle());
  const [uRound, setURound] = useState(0);
  const [uHints, setUHints] = useState<number[]>(() => ROUND_LENGTHS.map(() => 0));
  const [uSkipped, setUSkipped] = useState<boolean[]>(() => ROUND_LENGTHS.map(() => false));
  const [uStartedAt, setUStartedAt] = useState<number>(() => Date.now());
  const [uFinishedMs, setUFinishedMs] = useState<number | null>(null);

  const progress: DailyProgress | null = save.daily && save.daily.date === today ? save.daily : null;
  const dailyDone = !!progress && progress.finishedMs !== null;
  const dailyRunning = !!progress && !dailyDone && phase === "ready";
  const dailyHints = progress ? sum(progress.hints) : 0;
  const dailyElapsed = useElapsed(progress?.startedAt ?? null, dailyRunning);
  const dailyTime = dailyDone ? (progress!.finishedMs as number) : dailyElapsed + dailyHints * HINT_PENALTY_MS;

  const unlimitedDone = uFinishedMs !== null;
  const unlimitedElapsed = useElapsed(uStartedAt, mode === "unlimited" && !unlimitedDone && save.unlockedUnlimited);
  const unlimitedTime = unlimitedDone ? uFinishedMs : unlimitedElapsed;

  const submitDaily = useCallback(
    (timeMs: number, hints: number) => {
      setScoreStatus("saving");
      submitScore({ puzzleDate: today, timeMs, hints })
        .then(() => {
          setScoreStatus("saved");
          setLeaderboardKey((k) => k + 1);
        })
        .catch(() => setScoreStatus("failed"));
    },
    [today]
  );

  const bootAuth = useCallback(async () => {
    setPhase("auth_checking");
    try {
      const session = await ensureSession();
      if (!session.ok) {
        setAuthBlockedReason(session.reason || "unknown");
        setPhase("auth_blocked");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const anon = userData.user?.is_anonymous ?? true;
      setUserId(uid);

      const name = await ensureProfile().catch(() => null);
      if (name) {
        setDisplayName(name);
        setHasProfile(true);
        // A finish from earlier today that never reached the server (offline,
        // closed tab) gets another try. Only the first finish ever counts.
        const s = localSave.get();
        if (s.daily && s.daily.date === todayUtc() && s.daily.finishedMs !== null) {
          submitScore({ puzzleDate: s.daily.date, timeMs: s.daily.finishedMs, hints: sum(s.daily.hints) })
            .then(() => setLeaderboardKey((k) => k + 1))
            .catch(() => undefined);
        }
      }

      const choiceDone = typeof window !== "undefined" && sessionStorage.getItem(PLAY_CHOICE_KEY) === "true";
      setPhase(!anon || choiceDone || name ? "ready" : "choice");
    } catch (err) {
      console.error("Failed to establish session:", err);
      setAuthBlockedReason("unknown");
      setPhase("auth_blocked");
    }
  }, []);

  useEffect(() => {
    bootAuth();
  }, [bootAuth]);

  const handleAuthResolved = useCallback(
    (opts: { isAnonymous: boolean; displayName?: string }) => {
      if (typeof window !== "undefined") sessionStorage.setItem(PLAY_CHOICE_KEY, "true");
      setShowAuth(false);
      setPhase("ready");
      if (!opts.displayName && opts.isAnonymous) return; // plain guest
      if (opts.displayName) setDisplayName(opts.displayName);
      // Logging in swaps the guest session for the account's own user.
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
      setHasProfile(true);
      // Someone who finished as a guest and then made an account still gets
      // today's time on the board.
      const s = localSave.get();
      if (s.daily && s.daily.date === today && s.daily.finishedMs !== null) {
        submitDaily(s.daily.finishedMs, sum(s.daily.hints));
      }
    },
    [today, submitDaily]
  );

  // ---- Daily -------------------------------------------------------------

  const startDaily = () => {
    setSave(localSave.startDaily(today, daily.rounds.length));
  };

  const handleDailySolved = () => {
    if (!progress) return;
    const nextRound = progress.round + 1;
    if (nextRound < daily.rounds.length) {
      setSave(localSave.updateDaily({ round: nextRound }));
      return;
    }

    const hints = sum(progress.hints);
    const timeMs = Math.max(1, Date.now() - progress.startedAt + hints * HINT_PENALTY_MS);
    localSave.updateDaily({ round: nextRound });
    const prevUnlocked = save.unlockedAchievements;
    let updated = localSave.recordDailyWin(today, timeMs, hints);

    const newIds = diffNewlyUnlocked(updated, prevUnlocked);
    if (newIds.length > 0) {
      updated = localSave.setUnlockedAchievements([...prevUnlocked, ...newIds]);
      setNewlyUnlocked(ACHIEVEMENTS.filter((a) => newIds.includes(a.id)));
    }
    setSave(updated);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1800);

    if (hasProfile) submitDaily(timeMs, hints);
  };

  const handleDailyHint = () => {
    if (!progress) return;
    const hints = [...progress.hints];
    const len = daily.rounds[progress.round].answer.length;
    if (hints[progress.round] >= len) return;
    hints[progress.round] += 1;
    setSave(localSave.updateDaily({ hints }));
  };

  const handleShare = async () => {
    if (!progress || progress.finishedMs === null) return;
    const result = await shareResult(buildShareText(today, progress.finishedMs, progress.hints));
    setShareState(result);
    setTimeout(() => setShareState("idle"), 2200);
  };

  // ---- Classic Unlimited ---------------------------------------------------

  const newUnlimitedSet = () => {
    setUnlimited(getRandomPuzzle());
    setURound(0);
    setUHints(ROUND_LENGTHS.map(() => 0));
    setUSkipped(ROUND_LENGTHS.map(() => false));
    setUStartedAt(Date.now());
    setUFinishedMs(null);
  };

  const handleUnlimitedSolved = () => {
    const next = uRound + 1;
    setURound(next);
    if (next >= unlimited.rounds.length) setUFinishedMs(Math.max(1, Date.now() - uStartedAt));
  };

  const handleUnlimitedHint = () => {
    const len = unlimited.rounds[uRound].answer.length;
    setUHints((prev) => prev.map((h, i) => (i === uRound ? Math.min(h + 1, len) : h)));
  };

  /** Skipping reveals the whole word (so you learn it) and moves on. */
  const handleUnlimitedSkip = () => {
    const len = unlimited.rounds[uRound].answer.length;
    setUSkipped((prev) => prev.map((s, i) => (i === uRound ? true : s)));
    setUHints((prev) => prev.map((h, i) => (i === uRound ? len : h)));
  };

  const handleUnlock = () => {
    // Stub — no payment processor wired up yet. Replace with a real
    // server-verified purchase flow before this ever ships.
    alert("Payments aren't set up yet — Classic Unlimited will unlock for $2 once that's wired in.");
  };

  const locked = mode === "unlimited" && !save.unlockedUnlimited;

  // ---- Screens -------------------------------------------------------------

  if (phase === "auth_checking") {
    return (
      <div className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <WordmarkTiles />
      </div>
    );
  }

  if (phase === "auth_blocked") {
    return (
      <div className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center gap-4 px-4 text-center">
        <WifiOff className="w-8 h-8 text-danger" />
        <p className="text-sm text-muted max-w-xs">
          {authBlockedReason === "anonymous_disabled"
            ? "Guest play is temporarily unavailable for this game. Please try again shortly."
            : "Couldn't connect right now. Check your connection and try again."}
        </p>
        <button
          type="button"
          onClick={bootAuth}
          className="px-4 py-2 rounded-md bg-correct hover:bg-correct-dim text-paper text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (phase === "choice") {
    return <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />;
  }

  const showTimer = mode === "daily" ? !!progress : !locked;
  const timerValue = mode === "daily" ? dailyTime : unlimitedTime ?? 0;
  const modalOpen = showAuth || showAchievements;

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col items-center px-4 py-6 gap-5">
      <header className="w-full max-w-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Phones need the room for the timer and streak. */}
          <WordmarkTiles className="hidden sm:flex" />
          <h1 className="font-display font-semibold text-lg truncate">
            {/* Full name for search engines and wider screens; phones show
                "Scramble" so the timer and streak still fit beside it. */}
            <span className="sr-only sm:not-sr-only">Wordezy </span>Scramble
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {showTimer && (
            <div className="flex items-center gap-1.5 text-sm text-paper/80 font-mono" aria-label="Time">
              <TimerIcon className="w-4 h-4" />
              {formatTime(timerValue)}
            </div>
          )}
          {save.streak > 0 && (
            <div className="flex items-center gap-1 text-sm text-present font-mono" title="Daily streak">
              <Flame className="w-4 h-4" />
              {save.streak}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAchievements(true)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-paper transition-colors"
            aria-label="Achievements"
          >
            <Award className="w-4 h-4" />
            {save.unlockedAchievements.length}/{ACHIEVEMENTS.length}
          </button>
        </div>
      </header>

      {showConfetti && <Confetti durationMs={1800} />}
      {newlyUnlocked && newlyUnlocked.length > 0 && (
        <AchievementToastStack achievements={newlyUnlocked} onDone={() => setNewlyUnlocked(null)} />
      )}
      {showAchievements && <AchievementsModal save={save} onClose={() => setShowAchievements(false)} />}
      {showAuth && <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />}

      <div className="flex items-center gap-1 p-1 bg-surface border border-rule rounded-lg">
        <button
          type="button"
          onClick={() => setMode("daily")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "daily" ? "bg-correct text-paper" : "text-muted hover:text-paper"
          }`}
        >
          Daily
        </button>
        <button
          type="button"
          onClick={() => {
            // Start an untouched set's clock when the player actually opens it.
            if (mode !== "unlimited" && uRound === 0 && sum(uHints) === 0) setUStartedAt(Date.now());
            setMode("unlimited");
          }}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "unlimited" ? "bg-correct text-paper" : "text-muted hover:text-paper"
          }`}
        >
          {!save.unlockedUnlimited && <Lock className="w-3.5 h-3.5" />}
          Classic Unlimited
        </button>
      </div>

      <main className="w-full max-w-xl flex flex-col items-center gap-6">
        {mode === "daily" && !progress && (
          <section className="w-full bg-surface border border-rule rounded-xl p-6 text-center space-y-5 animate-rise-in">
            <div className="space-y-1.5">
              <p className="text-xs font-mono text-muted uppercase tracking-wide">
                {new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </p>
              <h2 className="font-display font-semibold text-2xl">Today's scramble</h2>
              <p className="text-sm text-muted">Five words, from 4 letters up to 8. Unscramble them all as fast as you can.</p>
            </div>
            <RoundPips current={-1} hints={[]} done={false} />
            <ul className="text-sm text-paper/80 space-y-2 text-left max-w-xs mx-auto">
              <li className="flex items-start gap-2.5">
                <Keyboard className="w-4 h-4 mt-0.5 text-correct shrink-0" />
                Tap the letters, or just type, to spell the word.
              </li>
              <li className="flex items-start gap-2.5">
                <Shuffle className="w-4 h-4 mt-0.5 text-correct shrink-0" />
                Shuffle the tiles to see the word from a new angle.
              </li>
              <li className="flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 mt-0.5 text-present shrink-0" />
                Stuck? A hint places the next letter, but adds {HINT_PENALTY_MS / 1000} seconds.
              </li>
            </ul>
            <button
              type="button"
              onClick={startDaily}
              className="inline-flex items-center justify-center gap-2 w-full max-w-xs py-3 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Play — the clock starts now
            </button>
            {save.bestDailyTimeMs !== null && (
              <p className="text-xs font-mono text-muted">Your best: {formatTime(save.bestDailyTimeMs)}</p>
            )}
          </section>
        )}

        {mode === "daily" && progress && !dailyDone && (
          <>
            <RoundPips current={progress.round} hints={progress.hints} done={false} />
            <p className="text-xs font-mono text-muted uppercase tracking-wide -mt-2">
              Word {progress.round + 1} of {daily.rounds.length} · {daily.rounds[progress.round].answer.length} letters
            </p>
            <ScrambleBoard
              key={`daily:${today}:${progress.round}`}
              round={daily.rounds[progress.round]}
              locked={progress.hints[progress.round]}
              active={!modalOpen}
              onSolved={handleDailySolved}
              onHint={handleDailyHint}
              hintLabel={`Hint +${HINT_PENALTY_MS / 1000}s`}
            />
          </>
        )}

        {mode === "daily" && progress && dailyDone && (
          <DailyResult
            puzzle={daily}
            progress={progress}
            streak={save.streak}
            shareState={shareState}
            onShare={handleShare}
            scoreStatus={scoreStatus}
            hasProfile={hasProfile}
            onJoin={() => setShowAuth(true)}
          />
        )}
        {mode === "daily" && dailyDone && (
          <Leaderboard date={today} currentPlayerId={userId} refreshKey={leaderboardKey} />
        )}

        {locked && (
          <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-4 mt-4">
            <div className="w-12 h-12 rounded-full bg-present-soft border border-present-dim/50 flex items-center justify-center text-present mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-lg">Classic Unlimited</h2>
              <p className="text-sm text-muted mt-1.5">
                Unlock endless five-word sets — free hints, skip any word, play as many as you want, whenever you want.
              </p>
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              className="w-full py-2.5 px-4 rounded-md bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors"
            >
              Unlock for $2
            </button>
          </section>
        )}

        {mode === "unlimited" && !locked && !unlimitedDone && (
          <>
            <RoundPips current={uRound} hints={uHints} done={false} />
            <p className="text-xs font-mono text-muted uppercase tracking-wide -mt-2">
              Word {uRound + 1} of {unlimited.rounds.length} · {unlimited.rounds[uRound].answer.length} letters
            </p>
            <ScrambleBoard
              key={`${unlimited.id}:${uRound}`}
              round={unlimited.rounds[uRound]}
              locked={uHints[uRound]}
              active={!modalOpen}
              onSolved={handleUnlimitedSolved}
              onHint={handleUnlimitedHint}
              hintLabel="Hint"
              onSkip={uSkipped[uRound] ? undefined : handleUnlimitedSkip}
            />
          </>
        )}

        {mode === "unlimited" && !locked && unlimitedDone && (
          <section className="w-full bg-surface border border-rule rounded-xl p-6 text-center space-y-4 animate-rise-in">
            <p className="text-xs font-mono text-muted uppercase tracking-wide">Set complete</p>
            <p className="font-mono text-3xl text-correct">{formatTime(uFinishedMs ?? 0)}</p>
            <WordRecap puzzle={unlimited} hints={uHints} skipped={uSkipped} />
            <button
              type="button"
              onClick={newUnlimitedSet}
              className="inline-flex items-center justify-center gap-2 w-full max-w-xs py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              New set
            </button>
          </section>
        )}
      </main>

      <footer className="w-full max-w-xl mt-auto pt-6 border-t border-rule/60 text-center space-y-2">
        <p className="text-xs text-muted">More free games on bgameworld</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {OTHER_GAMES.map((g) => (
            <a key={g.url} href={g.url} className="text-paper/80 hover:text-correct transition-colors">
              {g.name}
            </a>
          ))}
          <a href="https://bgameworld.com/" className="text-muted hover:text-paper transition-colors">
            All games
          </a>
        </nav>
      </footer>
    </div>
  );
};

/** The five words, revealed, with how each one was solved. */
const WordRecap: React.FC<{ puzzle: Puzzle; hints: number[]; skipped?: boolean[] }> = ({ puzzle, hints, skipped }) => (
  <ul className="space-y-1.5 text-left">
    {puzzle.rounds.map((r, i) => {
      const tone = skipped?.[i] ? "bg-absent text-muted" : hints[i] > 0 ? "bg-present text-ink" : "bg-correct text-ink";
      return (
        <li key={i} className="flex items-center justify-between gap-3">
          <span className="flex gap-[3px]">
            {r.answer.toUpperCase().split("").map((ch, k) => (
              <span
                key={k}
                className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-display font-semibold text-xs ${tone}`}
              >
                {ch}
              </span>
            ))}
          </span>
          <span className="text-[11px] font-mono text-muted shrink-0">
            {skipped?.[i] ? "skipped" : hints[i] > 0 ? `${hints[i]} hint${hints[i] === 1 ? "" : "s"}` : "clean"}
          </span>
        </li>
      );
    })}
  </ul>
);

const DailyResult: React.FC<{
  puzzle: Puzzle;
  progress: DailyProgress;
  streak: number;
  shareState: "idle" | "shared" | "copied" | "failed";
  onShare: () => void;
  scoreStatus: "idle" | "saving" | "saved" | "failed";
  hasProfile: boolean;
  onJoin: () => void;
}> = ({ puzzle, progress, streak, shareState, onShare, scoreStatus, hasProfile, onJoin }) => {
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);
  const hints = sum(progress.hints);

  return (
    <section className="w-full bg-surface border border-rule rounded-xl p-6 space-y-5 animate-rise-in">
      <div className="text-center space-y-1">
        <p className="text-xs font-mono text-muted uppercase tracking-wide">Solved</p>
        <p className="font-mono text-4xl text-correct">{formatTime(progress.finishedMs ?? 0)}</p>
        <p className="text-xs text-muted">
          {hints > 0
            ? `Includes +${(hints * HINT_PENALTY_MS) / 1000}s for ${hints} hint${hints === 1 ? "" : "s"}`
            : "No hints — clean sweep"}
          {streak > 1 ? ` · ${streak}-day streak` : ""}
        </p>
      </div>

      <WordRecap puzzle={puzzle} hints={progress.hints} />

      <button
        type="button"
        onClick={onShare}
        className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors"
      >
        {shareState === "copied" ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        {shareState === "copied" ? "Copied — paste it anywhere" : shareState === "failed" ? "Couldn't copy — try again" : "Share result"}
      </button>

      <div className="text-center space-y-1.5">
        <p className="text-xs font-mono text-muted">Next puzzle in {formatCountdown(countdown)}</p>
        {!hasProfile ? (
          <button type="button" onClick={onJoin} className="text-xs text-correct hover:underline">
            Create a free account to put today's time on the leaderboard
          </button>
        ) : scoreStatus === "failed" ? (
          <p className="text-xs text-muted">Saved on this device — the leaderboard couldn't be reached.</p>
        ) : null}
      </div>
    </section>
  );
};
