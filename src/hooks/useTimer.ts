import { useEffect, useRef, useState } from "react";

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** A simple running stopwatch, pausable, reset by changing `resetKey`. */
export function useTimer(resetKey: string, running: boolean) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsedMs(0);
  }, [resetKey]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startRef.current), 250);
    return () => clearInterval(id);
  }, [running, resetKey]);

  return elapsedMs;
}

/** Wall-clock elapsed time since `startedAt`, ticking while `running`. Used
 *  for the daily puzzle, whose start time is saved — so reloading the page
 *  mid-puzzle keeps counting instead of starting the clock over. */
export function useElapsed(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** Formats a duration as h:mm:ss (for the next-puzzle countdown). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
