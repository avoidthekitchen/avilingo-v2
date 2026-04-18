import { create } from 'zustand'
import type { Manifest, Species, UserProgress, Tab, Lesson } from '../core/types'
import { loadManifest } from '../core/manifest'
import { isLessonComplete } from '../core/lesson'
import { isDue } from '../core/fsrs'
import { WebAudioPlayer, type AudioPlayer } from '../adapters/audio'
import { DexieStorage, type StorageAdapter } from '../adapters/storage'

interface AppState {
  // State
  activeTab: Tab
  manifest: Manifest | null
  allProgress: Map<string, UserProgress>
  lastPlayedClipId: Map<string, string>
  audioPlayer: AudioPlayer
  storage: StorageAdapter
  initialized: boolean
  error: string | null

  // Derived getters
  getCompletedLessons: () => number[]
  getIntroducedSpecies: () => Species[]
  getDueForReview: () => UserProgress[]
  hasRelearning: () => boolean

  // Actions
  initialize: () => Promise<void>
  setTab: (tab: Tab) => void
  updateProgress: (speciesId: string, progress: UserProgress) => Promise<void>
  introduceSpecies: (speciesIds: string[]) => Promise<void>
  logConfusion: (targetId: string, chosenId: string) => Promise<void>
  setLastPlayedClip: (speciesId: string, clipId: string) => void
  resetProgress: () => Promise<void>
  fastForwardToLesson: (lessonNum: number) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'learn',
  manifest: null,
  allProgress: new Map(),
  lastPlayedClipId: new Map(),
  audioPlayer: new WebAudioPlayer(),
  storage: new DexieStorage(),
  initialized: false,
  error: null,

  getCompletedLessons: () => {
    const { manifest, allProgress } = get()
    if (!manifest) return []
    return manifest.lesson_plan.lessons
      .filter((lesson: Lesson) => isLessonComplete(lesson, allProgress))
      .map((lesson: Lesson) => lesson.lesson)
  },

  getIntroducedSpecies: () => {
    const { manifest, allProgress } = get()
    if (!manifest) return []
    return manifest.species.filter(s => allProgress.get(s.id)?.introduced)
  },

  getDueForReview: () => {
    const { allProgress } = get()
    return Array.from(allProgress.values()).filter(isDue)
  },

  hasRelearning: () => {
    const { allProgress } = get()
    return Array.from(allProgress.values()).some(p => p.state === 'relearning')
  },

  initialize: async () => {
    try {
      const { storage } = get()
      const manifest = await loadManifest()
      const progressList = await storage.getAllProgress()
      const allProgress = new Map(progressList.map(p => [p.speciesId, p]))
      set({ manifest, allProgress, initialized: true, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load', initialized: false })
    }
  },

  setTab: (tab: Tab) => set({ activeTab: tab }),

  updateProgress: async (speciesId: string, progress: UserProgress) => {
    const { storage, allProgress } = get()
    await storage.saveProgress(progress)
    const updated = new Map(allProgress)
    updated.set(speciesId, progress)
    set({ allProgress: updated })
  },

  introduceSpecies: async (speciesIds: string[]) => {
    const { storage, allProgress } = get()
    const updated = new Map(allProgress)
    const now = Date.now()

    for (const id of speciesIds) {
      const existing = updated.get(id)
      const progress: UserProgress = existing
        ? { ...existing, introduced: true, introducedAt: existing.introducedAt ?? now }
        : {
            speciesId: id,
            introduced: true,
            introducedAt: now,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 'new',
          }
      updated.set(id, progress)
      await storage.saveProgress(progress)
    }

    set({ allProgress: updated })
  },

  logConfusion: async (targetId: string, chosenId: string) => {
    const { storage } = get()
    await storage.logConfusion({
      targetId,
      chosenId,
      timestamp: Date.now(),
    })
  },

  setLastPlayedClip: (speciesId: string, clipId: string) => {
    const { lastPlayedClipId } = get()
    const updated = new Map(lastPlayedClipId)
    updated.set(speciesId, clipId)
    set({ lastPlayedClipId: updated })
  },

  resetProgress: async () => {
    const { storage } = get()
    await storage.clearAll()
    set({ allProgress: new Map() })
  },

  fastForwardToLesson: async (lessonNum: number) => {
    const { manifest, storage, allProgress } = get()
    if (!manifest) return
    const updated = new Map(allProgress)
    const now = Date.now()
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000

    for (const lesson of manifest.lesson_plan.lessons) {
      if (lesson.lesson >= lessonNum) break
      for (const speciesId of lesson.species) {
        if (!updated.get(speciesId)?.introduced) {
          const progress: UserProgress = {
            speciesId,
            introduced: true,
            introducedAt: now - oneWeekMs,
            stability: 10,
            difficulty: 5,
            elapsedDays: 7,
            scheduledDays: 14,
            reps: 3,
            lapses: 0,
            state: 'review',
            lastReview: now - oneWeekMs,
            nextReview: now + oneWeekMs,
          }
          updated.set(speciesId, progress)
          await storage.saveProgress(progress)
        }
      }
    }
    set({ allProgress: updated })
  },
}))
