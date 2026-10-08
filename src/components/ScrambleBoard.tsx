import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shuffle, Delete, Lightbulb, SkipForward } from "lucide-react";
import { isCorrectGuess, type Round } from "../lib/scramble.ts";

/** Render with `key` set to something unique per dealt word, so a new word
 *  always mounts a fresh board instead of reusing the last word's state. */
interface Props {
  round: Round;
  /** Leading letters of the answer locked in place by hints. */
  locked: number;
  /** Whether keyboard/tap input is accepted (false behind modals, etc.). */
  active: boolean;
  onSolved: () => void;
  onHint?: () => void;
  hintLabel?: string;
  onSkip?: () => void;
}

type Status = "idle" | "right" | "wrong";

/** Tile size shared by answer slots and letter tiles: fits eight across a
 *  320px-wide phone with page padding, and stops growing on desktop. */
const TILE = "min(9.6vw, 3.25rem)";
const FONT = "min(5vw, 1.5rem)";

function randomOrder(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const ScrambleBoard: React.FC<Props> = ({ round, locked, active, onSolved, onHint, hintLabel, onSkip }) => {
  const letters = useMemo(() => round.scrambled.toUpperCase().split(""), [round.scrambled]);
  const answer = round.answer.toUpperCase();
  const n = letters.length;
  const lockedCount = Math.min(locked, n);

  // Display order of the letter tiles (Shuffle permutes it), and which tile
  // sits in each answer slot. Locked slots are filled from the answer itself.
  const [order, setOrder] = useState<number[]>(() => letters.map((_, i) => i));
  const [slots, setSlots] = useState<(number | null)[]>(() => Array(n).fill(null));
  const [status, setStatus] = useState<Status>("idle");

  // Tiles consumed by hint-locked letters: the first unused tile of each letter.
  const lockedTiles = useMemo(() => {
    const taken: number[] = [];
    for (let i = 0; i < lockedCount; i++) {
      const idx = letters.findIndex((ch, t) => ch === answer[i] && !taken.includes(t));
      if (idx >= 0) taken.push(idx);
    }
    return taken;
  }, [letters, answer, lockedCount]);

  // A new hint changes which tiles are spoken for — start the word over.
  useEffect(() => {
    setSlots(Array(n).fill(null));
    setStatus("idle");
  }, [lockedCount, n]);

  const used = useMemo(() => new Set<number>([...lockedTiles, ...slots.filter((s): s is number => s !== null)]), [lockedTiles, slots]);
  const slotLetters = Array.from({ length: n }, (_, i) =>
    i < lockedCount ? answer[i] : slots[i] !== null ? letters[slots[i] as number] : null
  );
  const full = slotLetters.every((l) => l !== null);

  const guess = slotLetters.map((l) => l ?? "").join("");

  // Judge a full row once; the timers below then act on the verdict. (Kept
  // as two effects so the verdict's own state change can't cancel its timer.)
  useEffect(() => {
    if (!full || status !== "idle") return;
    setStatus(isCorrectGuess(guess, round) ? "right" : "wrong");
  }, [full, status, guess, round]);

  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;

  useEffect(() => {
    if (status === "right") {
      const t = setTimeout(() => onSolvedRef.current(), 650);
      return () => clearTimeout(t);
    }
    if (status === "wrong") {
      const t = setTimeout(() => {
        setSlots(Array(n).fill(null));
        setStatus("idle");
      }, 520);
      return () => clearTimeout(t);
    }
  }, [status, n]);

  const place = useCallback(
    (tile: number) => {
      if (status !== "idle" || used.has(tile)) return;
      setSlots((prev) => {
        const next = [...prev];
        const empty = next.findIndex((s, i) => i >= lockedCount && s === null);
        if (empty === -1) return prev;
        next[empty] = tile;
        return next;
      });
    },
    [status, used, lockedCount]
  );

  const removeAt = (slot: number) => {
    if (status !== "idle" || slot < lockedCount) return;
    setSlots((prev) => {
      const next = [...prev];
      next[slot] = null;
      return next;
    });
  };

  const backspace = useCallback(() => {
    if (status !== "idle") return;
    setSlots((prev) => {
      const next = [...prev];
      for (let i = n - 1; i >= lockedCount; i--) {
        if (next[i] !== null) {
          next[i] = null;
          break;
        }
      }
      return next;
    });
  }, [status, n, lockedCount]);

  const shuffle = useCallback(() => {
    setOrder((prev) => {
      let next = randomOrder(n);
      // Make sure something visibly moves.
      for (let i = 0; i < 5 && next.every((v, k) => v === prev[k]); i++) next = randomOrder(n);
      return next;
    });
  }, [n]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === " ") {
        e.preventDefault();
        shuffle();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const ch = e.key.toUpperCase();
        const tile = order.find((t) => letters[t] === ch && !used.has(t));
        if (tile !== undefined) place(tile);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, backspace, shuffle, place, order, letters, used]);

  const slotTone = (i: number, letter: string | null) => {
    if (status === "right") return "bg-correct border-correct text-ink";
    if (status === "wrong") return "bg-danger-soft border-danger text-paper";
    if (i < lockedCount) return "bg-present-soft border-present-dim text-present";
    if (letter) return "bg-surface-high border-muted/60 text-paper";
    return "bg-transparent border-rule border-dashed text-transparent";
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 select-none">
      <div
        className={`flex gap-[5px] ${status === "wrong" ? "animate-shake" : ""}`}
        aria-label={`Answer, ${n} letters`}
        role="group"
      >
        {slotLetters.map((letter, i) => (
          <button
            key={i}
            type="button"
            onClick={() => removeAt(i)}
            disabled={!letter || i < lockedCount || status !== "idle"}
            aria-label={letter ? `Slot ${i + 1}: ${letter}${i < lockedCount ? " (hint)" : ", tap to remove"}` : `Slot ${i + 1}: empty`}
            className={`rounded-[6px] border-2 flex items-center justify-center font-display font-semibold transition-colors disabled:cursor-default ${slotTone(i, letter)} ${
              status === "right" ? "animate-pop" : ""
            }`}
            style={{ width: TILE, height: TILE, fontSize: FONT, animationDelay: status === "right" ? `${i * 45}ms` : undefined }}
          >
            {letter ?? "·"}
          </button>
        ))}
      </div>

      <div className="flex gap-[5px]" role="group" aria-label="Scrambled letters">
        {order.map((tile) => {
          const isUsed = used.has(tile);
          return (
            <button
              key={tile}
              type="button"
              onClick={() => place(tile)}
              disabled={isUsed || status !== "idle"}
              aria-label={isUsed ? "Used letter" : `Letter ${letters[tile]}`}
              className={`rounded-[6px] flex items-center justify-center font-display font-semibold transition-all ${
                isUsed
                  ? "bg-ink border border-rule text-transparent"
                  : "bg-paper text-ink shadow-[0_3px_0_#978c79] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
              }`}
              style={{ width: TILE, height: TILE, fontSize: FONT }}
            >
              {letters[tile]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={shuffle}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-paper/90 hover:border-muted/60 transition-colors"
        >
          <Shuffle className="w-4 h-4" />
          Shuffle
        </button>
        <button
          type="button"
          onClick={backspace}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-paper/90 hover:border-muted/60 transition-colors"
          aria-label="Remove last letter"
        >
          <Delete className="w-4 h-4" />
          Undo
        </button>
        {onHint && (
          <button
            type="button"
            onClick={onHint}
            disabled={status !== "idle" || lockedCount >= n}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-present-dim/50 bg-present-soft text-sm text-present hover:border-present transition-colors disabled:opacity-40"
          >
            <Lightbulb className="w-4 h-4" />
            {hintLabel ?? "Hint"}
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={status !== "idle"}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-muted hover:text-paper transition-colors disabled:opacity-40"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
        )}
      </div>
    </div>
  );
};
