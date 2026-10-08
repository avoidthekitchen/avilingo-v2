import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './appStore'
import { loadManifest } from '../core/manifest'
import { createNewProgress } from '../core/fsrs'
import type { StorageAdapter } from '../adapters/storage'
import type { Manifest } from '../core/types'

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
