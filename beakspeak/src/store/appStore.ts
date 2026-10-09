import { create } from 'zustand'
import type { Manifest, Species, UserProgress, Tab, Lesson } from '../core/types'
import { loadManifest } from '../core/manifest'
import { isLessonComplete } from '../core/lesson'
import { isDue } from '../core/fsrs'
import { WebAudioPlayer, type AudioPlayer } from '../adapters/audio'
import type { StorageAdapter } from '../adapters/storage'
import { createStorage } from '../adapters/createStorage'
import { StorageLoadError, type StorageFailureKind } from '../adapters/storageErrors'

/** Copy for the confirmation shown before an in-progress session is abandoned. */
export interface SessionExitPrompt {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
}

/** Registered by a running lesson or quiz so navigation can leave it deliberately. */
export interface SessionExitGuard {
  prompt: SessionExitPrompt
  /** A save is in flight; leaving now could discard it. */
  busy: boolean
  exit: () => void
}

interface AppState {
  // State
  activeTab: Tab
  sessionGuard: SessionExitGuard | null
  /** Set while the leave-session confirmation is open; tab is where to go after leaving. */
  pendingSessionExit: { tab: Tab | null } | null
  manifest: Manifest | null
  allProgress: Map<string, UserProgress>
  lastPlayedClipId: Map<string, string>
  audioPlayer: AudioPlayer
  storage: StorageAdapter
  initialized: boolean
  initializing: boolean
  progressLoadError: boolean
  progressLoadFailure: StorageFailureKind | null
  error: string | null

  // Derived getters
  getCompletedLessons: () => number[]
  getIntroducedSpecies: () => Species[]
  getDueForReview: () => UserProgress[]
  hasRelearning: () => boolean

  // Actions
  initialize: () => Promise<void>
  setTab: (tab: Tab) => void
  setSessionGuard: (guard: SessionExitGuard | null) => void
  navigateTo: (tab: Tab) => void
  requestSessionExit: () => void
  confirmSessionExit: () => void
  cancelSessionExit: () => void
  updateProgress: (speciesId: string, progress: UserProgress) => Promise<void>
  introduceSpecies: (speciesIds: string[]) => Promise<void>
  logConfusion: (targetId: string, chosenId: string) => Promise<void>
  setLastPlayedClip: (speciesId: string, clipId: string) => void
  resetProgress: () => Promise<void>
  eraseCorruptProgress: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'learn',
  sessionGuard: null,
  pendingSessionExit: null,
  manifest: null,
  allProgress: new Map(),
  lastPlayedClipId: new Map(),
  audioPlayer: new WebAudioPlayer(),
  storage: createStorage(),
  initialized: false,
  initializing: false,
  progressLoadError: false,
  progressLoadFailure: null,
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
    if (get().initializing) return
    set({ initializing: true })
    try {
      const manifest = get().manifest ?? await loadManifest()
      set({ manifest, error: null })
      try {
        const progressList = await get().storage.getAllProgress()
        set({ allProgress: new Map(progressList.map(p => [p.speciesId, p])), progressLoadError: false, progressLoadFailure: null })
      } catch (error) {
        // Keep content available, but never overwrite unreadable saved progress.
        set({ progressLoadError: true, progressLoadFailure: error instanceof StorageLoadError ? error.kind : 'unavailable' })
      }
      set({ initialized: true })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load', initialized: false })
    } finally {
      set({ initializing: false })
    }
  },

  setTab: (tab: Tab) => set({ activeTab: tab }),
  setSessionGuard: (guard: SessionExitGuard | null) =>
    set(guard ? { sessionGuard: guard } : { sessionGuard: null, pendingSessionExit: null }),

  // Session state lives in the session component, so switching tabs mid-session would
  // discard it. Tab taps during a session ask first; tapping the session's own tab
  // returns to that tab's start, matching iOS tab bar behavior.
  navigateTo: (tab: Tab) => {
    const { sessionGuard } = get()
    if (!sessionGuard) {
      set({ activeTab: tab })
      return
    }
    if (sessionGuard.busy) return
    set({ pendingSessionExit: { tab } })
  },

  requestSessionExit: () => {
    const { sessionGuard } = get()
    if (!sessionGuard || sessionGuard.busy) return
    set({ pendingSessionExit: { tab: null } })
  },

  confirmSessionExit: () => {
    const { sessionGuard, pendingSessionExit } = get()
    if (!pendingSessionExit || sessionGuard?.busy) return
    set({ pendingSessionExit: null })
    sessionGuard?.exit()
    if (pendingSessionExit.tab) set({ activeTab: pendingSessionExit.tab })
  },

  cancelSessionExit: () => set({ pendingSessionExit: null }),

  updateProgress: async (speciesId: string, progress: UserProgress) => {
    const { storage, progressLoadError } = get()
    if (progressLoadError) throw new Error('Saved progress is unavailable')
    await storage.saveProgress(progress)
    const updated = new Map(get().allProgress)
    updated.set(speciesId, progress)
    set({ allProgress: updated })
  },

  introduceSpecies: async (speciesIds: string[]) => {
    const { storage, allProgress, progressLoadError } = get()
    if (progressLoadError) throw new Error('Saved progress is unavailable')
    const records: UserProgress[] = []
    const now = Date.now()

    for (const id of speciesIds) {
      const existing = allProgress.get(id)
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
      records.push(progress)
    }

    await storage.saveProgressBatch(records)
    const updated = new Map(get().allProgress)
    for (const progress of records) updated.set(progress.speciesId, progress)
    set({ allProgress: updated })
  },

  logConfusion: async (targetId: string, chosenId: string) => {
    const { storage, progressLoadError } = get()
    if (progressLoadError) throw new Error('Saved progress is unavailable')
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
    const { storage, progressLoadError } = get()
    if (progressLoadError) throw new Error('Saved progress is unavailable')
    await storage.clearAll()
    get().audioPlayer.stop()
    set({ allProgress: new Map(), lastPlayedClipId: new Map() })
  },

  eraseCorruptProgress: async () => {
    const { storage, progressLoadError, progressLoadFailure, initializing } = get()
    if (!progressLoadError || progressLoadFailure !== 'corrupt' || initializing) {
      throw new Error('Saved progress cannot be erased from this state')
    }
    set({ initializing: true })
    try {
      // Explicit confirmation in the recovery UI is the only path that may erase
      // unreadable records. clearAll still verifies native schema compatibility.
      await storage.clearAll()
      get().audioPlayer.stop()
      set({
        allProgress: new Map(), lastPlayedClipId: new Map(), activeTab: 'learn', sessionGuard: null, pendingSessionExit: null,
        progressLoadError: false, progressLoadFailure: null,
      })
    } finally {
      set({ initializing: false })
    }
  },
}))
