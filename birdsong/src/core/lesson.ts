import type { Lesson, UserProgress, Species, IntroQuizItem, ReviewQuizItem, AudioClip } from './types';
import { getAllClips } from './manifest';

export function getNextLesson(
  lessons: Lesson[],
  completedLessonNums: number[]
): Lesson | null {
  const completedSet = new Set(completedLessonNums);
  const next = lessons.find((l) => !completedSet.has(l.lesson));
  return next ?? null;
}

export function isLessonAvailable(
  lessonNum: number,
  completedLessonNums: number[],
  allProgress: Map<string, UserProgress>
): boolean {
  if (lessonNum === 1) return true;
  const prevComplete = completedLessonNums.includes(lessonNum - 1);
  if (!prevComplete) return false;
  for (const p of allProgress.values()) {
    if (p.state === 'relearning') return false;
  }
  return true;
}

export function isLessonComplete(
  lesson: Lesson,
  allProgress: Map<string, UserProgress>
): boolean {
  return lesson.species.every((id) => {
    const p = allProgress.get(id);
    return p?.introduced === true;
  });
}

function pickRandom<T>(arr: T[], count: number, exclude?: Set<T>): T[] {
  const available = exclude ? arr.filter((x) => !exclude.has(x)) : [...arr];
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function selectRandomClip(clips: AudioClip[], lastClipId?: string): AudioClip {
  const available = clips.length > 1 && lastClipId
    ? clips.filter((c) => c.xc_id !== lastClipId)
    : clips;
  return available[Math.floor(Math.random() * available.length)];
}

export function buildIntroQuiz(
  lesson: Lesson,
  introducedSpecies: Species[],
  allSpecies: Species[],
  lastPlayedClipIds: Map<string, string>
): IntroQuizItem[] {
  const lessonSpecies = lesson.species
    .map((id) => allSpecies.find((s) => s.id === id))
    .filter((s): s is Species => s !== undefined);

  const items: IntroQuizItem[] = [];
  const lessonIds = new Set(lesson.species);

  for (const sp of lessonSpecies) {
    const allClips = getAllClips(sp);
    const clip = selectRandomClip(allClips, lastPlayedClipIds.get(sp.id));
    const distractorPool = introducedSpecies.length > 0
      ? introducedSpecies.filter((s) => !lessonIds.has(s.id))
      : lessonSpecies.filter((s) => s.id !== sp.id);
    const distractors = pickRandom(distractorPool, 2, new Set([sp]));
    items.push({ targetSpecies: sp, distractors, clip });
  }

  if (introducedSpecies.length > 0) {
    const reviewPool = introducedSpecies.slice();
    const reviews = pickRandom(reviewPool, 2);
    for (const sp of reviews) {
      const allClips = getAllClips(sp);
      const clip = selectRandomClip(allClips, lastPlayedClipIds.get(sp.id));
      const distractorPool = [...introducedSpecies, ...lessonSpecies].filter(
        (s) => s.id !== sp.id
      );
      const distractors = pickRandom(distractorPool, 2, new Set([sp]));
      items.push({ targetSpecies: sp, distractors, clip });
    }
  }

  return items.sort(() => Math.random() - 0.5);
}

export function buildReviewQuiz(
  introducedSpecies: Species[],
  lastPlayedClipIds: Map<string, string>
): ReviewQuizItem[] {
  if (introducedSpecies.length < 3) return [];
  const count = Math.min(3, introducedSpecies.length);
  const selected = pickRandom(introducedSpecies, count);
  return selected.map((sp) => {
    const allClips = getAllClips(sp);
    const clip = selectRandomClip(allClips, lastPlayedClipIds.get(sp.id));
    const distractorPool = introducedSpecies.filter((s) => s.id !== sp.id);
    const distractors = pickRandom(distractorPool, 2, new Set([sp]));
    return { targetSpecies: sp, distractors, clip };
  });
}

export function getCompletedLessonNums(
  lessons: Lesson[],
  allProgress: Map<string, UserProgress>
): number[] {
  return lessons
    .filter((l) => isLessonComplete(l, allProgress))
    .map((l) => l.lesson);
}

export function getAvailableLessons(
  lessons: Lesson[],
  allProgress: Map<string, UserProgress>
): Lesson[] {
  const completed = getCompletedLessonNums(lessons, allProgress);
  return lessons.filter((l) => isLessonAvailable(l.lesson, completed, allProgress));
}
