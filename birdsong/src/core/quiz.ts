import type { UserProgress, QuizItem, Species, ConfuserPair, AudioClip, ExerciseType } from './types';
import { getAllClips } from './manifest';

function selectDistractors(
  target: Species,
  introduced: Species[],
  confuserPairs: ConfuserPair[],
  count: number
): Species[] {
  const confuserIds = new Set<string>();
  for (const pair of confuserPairs) {
    if (pair.pair[0] === target.id) confuserIds.add(pair.pair[1]);
    if (pair.pair[1] === target.id) confuserIds.add(pair.pair[0]);
  }

  const confuserSpecies = introduced.filter(
    (s) => confuserIds.has(s.id) && s.id !== target.id
  );
  const otherSpecies = introduced.filter(
    (s) => !confuserIds.has(s.id) && s.id !== target.id
  );

  const shuffledConfusers = confuserSpecies.sort(() => Math.random() - 0.5);
  const shuffledOthers = otherSpecies.sort(() => Math.random() - 0.5);

  const distractors: Species[] = [];
  for (const s of shuffledConfusers) {
    if (distractors.length >= count) break;
    distractors.push(s);
  }
  for (const s of shuffledOthers) {
    if (distractors.length >= count) break;
    distractors.push(s);
  }

  return distractors.slice(0, count);
}

function selectClip(species: Species, lastPlayedClipId?: string): AudioClip {
  const clips = getAllClips(species);
  if (clips.length <= 1) return clips[0];
  const available = lastPlayedClipId
    ? clips.filter((c) => c.xc_id !== lastPlayedClipId)
    : clips;
  return available[Math.floor(Math.random() * available.length)] ?? clips[0];
}

function selectExerciseType(progress: UserProgress): ExerciseType {
  if (progress.reps < 3) return 'three_choice';
  return 'same_different';
}

export function buildQuizSession(
  allProgress: Map<string, UserProgress>,
  species: Species[],
  confuserPairs: ConfuserPair[],
  lastPlayedClipIds: Map<string, string>,
  targetCount: number = 9
): QuizItem[] {
  const introduced: Species[] = [];
  const due: Species[] = [];

  for (const sp of species) {
    const p = allProgress.get(sp.id);
    if (!p?.introduced) continue;
    introduced.push(sp);
    if (isDueForReview(p)) due.push(sp);
  }

  const items: QuizItem[] = [];
  const dueSorted = due.sort((a, b) => {
    const pa = allProgress.get(a.id)!;
    const pb = allProgress.get(b.id)!;
    const overdueA = (pa.nextReview ?? Infinity) - Date.now();
    const overdueB = (pb.nextReview ?? Infinity) - Date.now();
    return overdueA - overdueB;
  });

  const reviewCount = Math.min(
    Math.round(targetCount * 0.7),
    dueSorted.length
  );

  for (let i = 0; i < reviewCount; i++) {
    const sp = dueSorted[i];
    const progress = allProgress.get(sp.id)!;
    const exerciseType = selectExerciseType(progress);
    const clip = selectClip(sp, lastPlayedClipIds.get(sp.id));
    const distractors = selectDistractors(sp, introduced, confuserPairs, 2);

    if (exerciseType === 'same_different' && introduced.length >= 2) {
      const samePair = Math.random() < 0.5;
      if (samePair) {
        const allClips = getAllClips(sp);
        const secondClip = allClips.filter((c) => c.xc_id !== clip.xc_id);
        items.push({
          targetSpecies: sp,
          exerciseType: 'same_different',
          distractors: [],
          clip,
          secondClip: secondClip[0] ?? clip,
          isSame: true,
        });
      } else {
        const confuserForPair = confuserPairs.find(
          (p) => (p.pair[0] === sp.id || p.pair[1] === sp.id)
        );
        let otherSp: Species | undefined;
        if (confuserForPair) {
          const otherId = confuserForPair.pair[0] === sp.id
            ? confuserForPair.pair[1]
            : confuserForPair.pair[0];
          otherSp = introduced.find((s) => s.id === otherId);
        }
        if (!otherSp) {
          const others = introduced.filter((s) => s.id !== sp.id);
          otherSp = others[Math.floor(Math.random() * others.length)];
        }
        const otherClip = selectClip(otherSp, lastPlayedClipIds.get(otherSp.id));
        items.push({
          targetSpecies: sp,
          exerciseType: 'same_different',
          distractors: [],
          clip,
          secondClip: otherClip,
          isSame: false,
        });
      }
    } else {
      items.push({
        targetSpecies: sp,
        exerciseType: 'three_choice',
        distractors,
        clip,
      });
    }
  }

  while (items.length < targetCount && dueSorted.length > items.length) {
    const remaining = dueSorted.filter(
      (sp) => !items.some((it) => it.targetSpecies.id === sp.id)
    );
    if (remaining.length === 0) break;
    const sp = remaining[0];
    const clip = selectClip(sp, lastPlayedClipIds.get(sp.id));
    const distractors = selectDistractors(sp, introduced, confuserPairs, 2);
    items.push({
      targetSpecies: sp,
      exerciseType: 'three_choice',
      distractors,
      clip,
    });
  }

  return items.sort(() => Math.random() - 0.5);
}

function isDueForReview(progress: UserProgress): boolean {
  if (!progress.introduced) return false;
  if (!progress.nextReview) return true;
  return Date.now() >= progress.nextReview;
}

export function countDue(allProgress: Map<string, UserProgress>): number {
  let count = 0;
  for (const p of allProgress.values()) {
    if (isDueForReview(p)) count++;
  }
  return count;
}

export function getDueSpecies(
  allProgress: Map<string, UserProgress>,
  species: Species[]
): Species[] {
  return species.filter((sp) => {
    const p = allProgress.get(sp.id);
    return p ? isDueForReview(p) : false;
  });
}

export function hasRelearning(allProgress: Map<string, UserProgress>): boolean {
  for (const p of allProgress.values()) {
    if (p.state === 'relearning') return true;
  }
  return false;
}
