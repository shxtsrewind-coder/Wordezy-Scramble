import React from "react";
import { X, Star, Flame, Zap, Gauge, Target, Trophy, Lock } from "lucide-react";
import { ACHIEVEMENTS } from "../data/achievements.ts";
import type { SaveData } from "../lib/localSave.ts";

const ICONS = { Star, Flame, Zap, Gauge, Target, Trophy };

export const AchievementsModal: React.FC<{ save: SaveData; onClose: () => void }> = ({ save, onClose }) => {
  const unlocked = new Set(save.unlockedAchievements);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface border border-rule rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Achievements</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-paper transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs font-mono text-muted">
          {unlocked.size} / {ACHIEVEMENTS.length} unlocked
        </p>
        <div className="space-y-2">
          {ACHIEVEMENTS.map((a) => {
            const isUnlocked = unlocked.has(a.id);
            const Icon = ICONS[a.icon];
            const progress = a.id.startsWith("streak_") ? `Best streak: ${save.maxStreak}` : undefined;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  isUnlocked ? "bg-correct-soft border-correct-dim/40" : "bg-ink border-rule"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    isUnlocked ? "bg-correct text-ink" : "bg-surface-high text-muted"
                  }`}
                >
                  {isUnlocked ? <Icon className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isUnlocked ? "text-correct" : "text-paper/80"}`}>{a.title}</p>
                  <p className="text-xs text-muted">{a.description}</p>
                  {!isUnlocked && progress && <p className="text-[11px] font-mono text-muted mt-0.5">{progress}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
