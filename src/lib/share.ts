import { formatTime } from "../hooks/useTimer.ts";

export const GAME_URL = "https://wordezyscramble.bgameworld.com/";

/** Spoiler-free result: one square per word — green if solved clean, gold
 *  if hints were used — so friends can compare without seeing the words. */
export function buildShareText(date: string, timeMs: number, hintsPerRound: number[]): string {
  const pretty = new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const squares = hintsPerRound.map((h) => (h > 0 ? "🟨" : "🟩")).join("");
  const totalHints = hintsPerRound.reduce((a, b) => a + b, 0);
  const hintNote = totalHints > 0 ? ` (${totalHints} hint${totalHints === 1 ? "" : "s"})` : "";
  return `Wordezy Scramble · ${pretty}\n⏱ ${formatTime(timeMs)}${hintNote}\n${squares}\n${GAME_URL}`;
}

/** Opens the native share sheet where there is one (phones), otherwise
 *  copies to the clipboard. Resolves to what happened, for the button label. */
export async function shareResult(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return "shared";
    }
  } catch (err) {
    // The player closing the share sheet isn't a failure worth reporting.
    if ((err as { name?: string })?.name === "AbortError") return "shared";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
