import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './appStore'
import { loadManifest } from '../core/manifest'
import { createNewProgress } from '../core/fsrs'
import type { StorageAdapter } from '../adapters/storage'
import type { Manifest } from '../core/types'
import { StorageLoadError } from '../adapters/storageErrors'

vi.mock('../core/manifest', () => ({ loadManifest: vi.fn() }))
const initial = useAppStore.getInitialState()
const manifest: Manifest = {
  version: '1', tier: 1, region: 'Test', target_species_count: 0,
  curation_date: '2026-10-07', data_sources: {}, species: [], confuser_pairs: [],
  lesson_plan: { description: 'Test', lessons: [] },
}
let storage: StorageAdapter
beforeEach(() => {
  storage = {
    getProgress: vi.fn(), saveProgress: vi.fn(), saveProgressBatch: vi.fn(),
    getAllProgress: vi.fn().mockResolvedValue([]), getConfusionLog: vi.fn(),
    logConfusion: vi.fn(), clearAll: vi.fn(),
  }
  useAppStore.setState({ ...initial, storage })
  vi.mocked(loadManifest).mockReset().mockResolvedValue(manifest)
})

describe('storage recovery', () => {
  it('erases confirmed corrupt progress only after durable reset succeeds and returns to the Guided Path', async () => {
    const saved = createNewProgress('a')
    useAppStore.setState({ allProgress: new Map([['a', saved]]), activeTab: 'progress', lastPlayedClipId: new Map([['a', 'clip']]) })
    vi.mocked(storage.getAllProgress).mockRejectedValueOnce(new StorageLoadError('corrupt', 'Invalid saved record'))
    await useAppStore.getState().initialize()
    vi.mocked(storage.clearAll).mockRejectedValueOnce(new Error('disk full'))
    await expect(useAppStore.getState().eraseCorruptProgress()).rejects.toThrow('disk full')
    expect(useAppStore.getState().allProgress.get('a')).toEqual(saved)
    expect(useAppStore.getState().progressLoadFailure).toBe('corrupt')
    expect(useAppStore.getState().initializing).toBe(false)
    await useAppStore.getState().eraseCorruptProgress()
    expect(useAppStore.getState()).toMatchObject({
      activeTab: 'learn', sessionActive: false, progressLoadError: false, progressLoadFailure: null,
      allProgress: new Map(), lastPlayedClipId: new Map(), initializing: false,
    })
  })

  it.each(['newer-schema', 'unavailable', 'timeout'] as const)('refuses corruption erasure for %s failures', async kind => {
    vi.mocked(storage.getAllProgress).mockRejectedValueOnce(new StorageLoadError(kind, 'Unavailable'))
    await useAppStore.getState().initialize()
    await expect(useAppStore.getState().eraseCorruptProgress()).rejects.toThrow()
    expect(storage.clearAll).not.toHaveBeenCalled()
  })

  it.each(['corrupt', 'newer-schema', 'timeout'] as const)('retains the %s reason without enabling ordinary progress writes', async kind => {
    vi.mocked(storage.getAllProgress).mockRejectedValueOnce(new StorageLoadError(kind, 'Saved progress unavailable'))
    await useAppStore.getState().initialize()
    expect(useAppStore.getState()).toMatchObject({ initialized: true, initializing: false, progressLoadError: true, progressLoadFailure: kind })
    await expect(useAppStore.getState().resetProgress()).rejects.toThrow()
    await expect(useAppStore.getState().introduceSpecies(['b'])).rejects.toThrow()
    expect(storage.clearAll).not.toHaveBeenCalled()
  })

  it('retains content and unreadable saved progress until a read retry succeeds', async () => {
    const saved = { ...createNewProgress('a'), introduced: true, reps: 6 }
    vi.mocked(storage.getAllProgress).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([saved])
    await useAppStore.getState().initialize()
    expect(useAppStore.getState()).toMatchObject({ manifest, initialized: true, progressLoadError: true, error: null })
    await expect(useAppStore.getState().introduceSpecies(['b'])).rejects.toThrow('unavailable')
    expect(storage.saveProgressBatch).not.toHaveBeenCalled()
    await useAppStore.getState().initialize()
    expect(useAppStore.getState().progressLoadError).toBe(false)
    expect(useAppStore.getState().allProgress.get('a')).toEqual(saved)
    expect(loadManifest).toHaveBeenCalledTimes(1)
  })

  it('does not publish a partly saved lesson to the UI', async () => {
    vi.mocked(storage.saveProgressBatch).mockRejectedValueOnce(new Error('quota'))
    await expect(useAppStore.getState().introduceSpecies(['a', 'b'])).rejects.toThrow()
    expect(useAppStore.getState().allProgress.size).toBe(0)
    await useAppStore.getState().introduceSpecies(['a', 'b'])
    expect([...useAppStore.getState().allProgress.values()].every(p => p.introduced)).toBe(true)
  })

  it('preserves another completed update while a save is pending', async () => {
    let finish!: () => void
    vi.mocked(storage.saveProgress).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const first = useAppStore.getState().updateProgress('a', createNewProgress('a'))
    await useAppStore.getState().updateProgress('b', createNewProgress('b'))
    finish()
    await first
    expect([...useAppStore.getState().allProgress.keys()].sort()).toEqual(['a', 'b'])
  })
})
