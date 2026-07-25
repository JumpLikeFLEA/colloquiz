// Single source of truth for level math. XP maps to levels at a flat rate:
// each level spans XP_PER_LEVEL of XP, and levels are 1-indexed (level 1 is
// 0–499 XP). This mirrors what the XP-award path on the server assumes, and is
// the only place the threshold is written — the Dashboard, Achievements and the
// sidebar all read it from here rather than re-deriving `xp / 500`.
//
// There is deliberately NO maximum level: the progression is unbounded, so
// every user always has a next level to climb toward. Callers therefore never
// need a "max level reached" branch.
export const XP_PER_LEVEL = 500;

export type LevelProgress = {
  /** Current level (1-indexed). */
  level: number;
  /** XP accumulated within the current level, 0 .. XP_PER_LEVEL-1. */
  xpIntoLevel: number;
  /** XP still needed to reach the next level, 1 .. XP_PER_LEVEL. */
  xpToNext: number;
  /** Progress toward the next level as a percentage, 0 .. 100 (exclusive of 100). */
  progress: number;
};

export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL - xpIntoLevel;
  const progress = (xpIntoLevel / XP_PER_LEVEL) * 100;
  return { level, xpIntoLevel, xpToNext, progress };
}
