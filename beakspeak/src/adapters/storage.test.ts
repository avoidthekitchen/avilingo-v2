import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DexieStorage } from './storage'
import { createNewProgress } from '../core/fsrs'

const storage = new DexieStorage()
beforeEach(async () => { await storage.clearAll() })
afterEach(() => vi.restoreAllMocks())

describe('Dexie storage contract', () => {
  it('saves, overwrites, lists, logs, and resets durable records', async () => {
    const progress = { ...createNewProgress('a'), introduced: true, reps: 1 }
    await storage.saveProgress(progress)
    await storage.saveProgress({ ...progress, reps: 2 })
    expect(await storage.getProgress('a')).toEqual({ ...progress, reps: 2 })
    expect(await storage.getProgress('missing')).toBeUndefined()
    expect(await storage.getAllProgress()).toHaveLength(1)
    await storage.logConfusion({ targetId: 'a', chosenId: 'b', timestamp: 123 })
    expect(await storage.getConfusionLog()).toEqual([expect.objectContaining({ targetId: 'a', chosenId: 'b', timestamp: 123 })])
    await storage.clearAll()
    expect(await storage.getAllProgress()).toEqual([])
    expect(await storage.getConfusionLog()).toEqual([])
  })

  it('rolls back every lesson record when one write fails', async () => {
    const existing = { ...createNewProgress('a'), reps: 1 }
    await storage.saveProgress(existing)
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (value.speciesId === 'b') throw new DOMException('quota', 'QuotaExceededError')
      return put.call(this, value, key)
    })
    await expect(storage.saveProgressBatch([{ ...existing, reps: 2 }, createNewProgress('b')])).rejects.toThrow()
    expect(await storage.getAllProgress()).toEqual([existing])
  })

  it('rolls back progress deletion when clearing confusions fails', async () => {
    const existing = createNewProgress('a')
    await storage.saveProgress(existing)
    await storage.logConfusion({ targetId: 'a', chosenId: 'b', timestamp: 123 })
    const clear = IDBObjectStore.prototype.clear
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      if (this.name === 'confusions') throw new DOMException('failed', 'UnknownError')
      return clear.call(this)
    })
    await expect(storage.clearAll()).rejects.toThrow()
    expect(await storage.getAllProgress()).toEqual([existing])
    expect(await storage.getConfusionLog()).toHaveLength(1)
  })

  it('reports read and write failures without losing committed records', async () => {
    const existing = createNewProgress('a')
    const event = { targetId: 'a', chosenId: 'b', timestamp: 123 }
    await storage.saveProgress(existing)
    await storage.logConfusion(event)
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
      throw new DOMException('unavailable', 'UnknownError')
    })
    await expect(storage.getProgress('a')).rejects.toThrow('unavailable')
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await expect(storage.saveProgress({ ...existing, reps: 9 })).rejects.toThrow('quota')
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await expect(storage.logConfusion(event)).rejects.toThrow('quota')
    expect(await storage.getProgress('a')).toEqual(existing)
    expect(await storage.getConfusionLog()).toEqual([expect.objectContaining(event)])
  })
})
