// Rescue Pins — static achievement set (spec §6 "Achievements and leaderboards"):
// first completion, mechanic mastery, a sustained streak, a difficult content
// milestone, and an accessibility-neutral long-term goal. Keys are stable,
// lowercase identifiers; unlock evaluation is pure and idempotent. Browser + Node.

export const ACHIEVEMENTS = [
  { key: 'first-rescue',       name: 'First Rescue',          description: 'Complete any stage.' },
  { key: 'mechanic-mastery',   name: 'Mechanic Mastery',      description: 'Finish all five Learn lessons.' },
  { key: 'daily-streak-7',     name: 'Week of Wonder',        description: 'Complete the daily challenge on seven consecutive days.' },
  { key: 'ember-depths-veteran', name: 'Ember Depths Veteran', description: 'Clear any stage in the final theme, Ember Depths.' },
  { key: 'guardian-hundred',   name: 'Century Guardian',      description: 'Rescue 100 villagers in total.' },
];

export function achievementByKey(key) {
  return ACHIEVEMENTS.find(a => a.key === key) || null;
}

// Longest run of consecutive UTC-day seeds in a list of completed daily days.
export function longestStreak(daySeeds) {
  const days = [...new Set(daySeeds || [])].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = (prev !== null && d === prev + 1) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

// Evaluate which achievements the progression document has earned.
// prog: { completed, bestScores, tutorialDone, streakDays, rescuedTotal, achievements }
// themeOfId: (levelId) => theme id, for the content-milestone check.
// Returns { unlocked, newly }; does not mutate prog.
export function evaluateAchievements(prog, themeOfId) {
  const unlocked = new Set(prog.achievements || []);
  const newly = [];
  const grant = (key) => { if (!unlocked.has(key)) { unlocked.add(key); newly.push(key); } };

  const completedIds = Object.keys(prog.completed || {});
  if (completedIds.length >= 1) grant('first-rescue');
  if (prog.tutorialDone) grant('mechanic-mastery');
  if (longestStreak(prog.streakDays) >= 7) grant('daily-streak-7');
  if (typeof themeOfId === 'function' &&
      completedIds.some(id => themeOfId(id) === 'ember-depths')) grant('ember-depths-veteran');
  if ((prog.rescuedTotal | 0) >= 100) grant('guardian-hundred');

  return { unlocked: [...unlocked], newly };
}
