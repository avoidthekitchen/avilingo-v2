import { create } from 'zustand';
import type { Manifest, Species, UserProgress, Tab, LessonSession } from '../core/types';
import { loadManifest } from '../core/manifest';
import { DexieStorage, type StorageAdapter } from '../adapters/storage';
import { WebAudioPlayer, type AudioPlayer } from '../adapters/audio';
import { createNewProgress } from '../core/fsrs';

interface AppState {
  initialized: boolean;
  error: string | null;
  activeTab: Tab;
  manifest: Manifest | null;
  allProgress: Map<string, UserProgress>;
  lastPlayedClipId: Map<string, string>;
  audioPlayer: AudioPlayer;
  storage: StorageAdapter;
  activeLessonSession: LessonSession | null;

  initializedSpecies: () => Species[];
  completedLessonNums: () => number[];

  initialize: () => Promise<void>;
  setTab: (tab: Tab) => void;
  updateProgress: (speciesId: string, progress: UserProgress) => Promise<void>;
  introduceSpecies: (speciesIds: string[]) => Promise<void>;
  logConfusion: (targetId: string, chosenId: string) => Promise<void>;
  setActiveLessonSession: (session: LessonSession | null) => void;
  setLastPlayedClip: (speciesId: string, clipId: string) => void;
  getOrCreateProgress: (speciesId: string) => UserProgress;
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  error: null,
  activeTab: 'learn',
  manifest: null,
  allProgress: new Map<string, UserProgress>(),
  lastPlayedClipId: new Map<string, string>(),
  audioPlayer: new WebAudioPlayer(),
  storage: new DexieStorage(),
  activeLessonSession: null,

  initializedSpecies: () => {
    const { manifest, allProgress } = get();
    if (!manifest) return [];
    return manifest.species.filter((sp) => allProgress.get(sp.id)?.introduced);
  },

  completedLessonNums: () => {
    const { manifest, allProgress } = get();
    if (!manifest) return [];
    const lessons = manifest.lesson_plan.lessons;
    return lessons
      .filter((l) => l.species.every((id) => allProgress.get(id)?.introduced))
      .map((l) => l.lesson);
  },

  initialize: async () => {
    try {
      const manifest = await loadManifest();
      const allProgressArr = await get().storage.getAllProgress();
      const allProgress = new Map<string, UserProgress>();
      for (const p of allProgressArr) {
        allProgress.set(p.speciesId, p);
      }
      set({ manifest, allProgress, initialized: true, error: null });
    } catch {
      set({ error: 'Failed to load bird data.', initialized: true });
    }
  },

  setTab: (tab) => set({ activeTab: tab }),

  updateProgress: async (speciesId, progress) => {
    const { allProgress } = get();
    const next = new Map(allProgress);
    next.set(speciesId, progress);
    set({ allProgress: next });
    await get().storage.saveProgress(progress);
  },

  introduceSpecies: async (speciesIds) => {
    const { allProgress, storage } = get();
    const next = new Map(allProgress);
    const now = Date.now();
    for (const id of speciesIds) {
      const existing = next.get(id);
      if (existing && existing.introduced) continue;
      const updated = existing
        ? { ...existing, introduced: true, introducedAt: now }
        : { ...createNewProgress(id), introduced: true, introducedAt: now };
      next.set(id, updated);
      await storage.saveProgress(updated);
    }
    set({ allProgress: next });
  },

  logConfusion: async (targetId, chosenId) => {
    await get().storage.logConfusion({
      targetId,
      chosenId,
      timestamp: Date.now(),
    });
  },

  setActiveLessonSession: (session) => set({ activeLessonSession: session }),

  setLastPlayedClip: (speciesId, clipId) => {
    const { lastPlayedClipId } = get();
    const next = new Map(lastPlayedClipId);
    next.set(speciesId, clipId);
    set({ lastPlayedClipId: next });
  },

  getOrCreateProgress: (speciesId) => {
    const { allProgress } = get();
    const existing = allProgress.get(speciesId);
    if (existing) return existing;
    return createNewProgress(speciesId);
  },
}));
