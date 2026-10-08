import React, { useEffect, useState } from "react";
import { Star, Flame, Zap, Gauge, Target, Trophy } from "lucide-react";
import type { Achievement } from "../data/achievements.ts";

const ICONS = { Star, Flame, Zap, Gauge, Target, Trophy };

/** Stacks newly-unlocked achievements one at a time, each visible for a few
 *  seconds, so two unlocked in the same moment (e.g. a streak milestone and
 *  a speed badge on the same solve) don't overlap illegibly. */
export const AchievementToastStack: React.FC<{ achievements: Achievement[]; onDone: () => void }> = ({
  achievements,
  onDone,
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= achievements.length) {
      onDone();
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), 3000);
    return () => clearTimeout(t);
  }, [index, achievements.length, onDone]);

  if (index >= achievements.length) return null;
  const a = achievements[index];
  const Icon = ICONS[a.icon];

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface border border-correct-dim/50 rounded-xl px-4 py-3 shadow-xl shadow-black/40 animate-achievement-in"
    >
      <div className="w-10 h-10 rounded-full bg-correct text-ink flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wide text-present">Achievement unlocked</p>
        <p className="text-sm font-display font-semibold text-paper">{a.title}</p>
      </div>
    </div>
  );
};
