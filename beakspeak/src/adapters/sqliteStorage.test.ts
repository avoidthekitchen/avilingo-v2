/// <reference types="node" />
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CapacitorSQLitePlugin } from '@capacitor-community/sqlite'
import { SQLiteStorage } from './sqliteStorage'
import { createNewProgress } from '../core/fsrs'

// Node 22 omits node:sqlite from builtinModules, so Vitest/Vite tries to bundle
// a static import. Load the real built-in through Node on every supported runtime.
const { DatabaseSync }: typeof import('node:sqlite') = createRequire(import.meta.url)('node:sqlite')

// Exercise real SQL at the Capacitor plugin boundary; no mock SQL parser.
class TestSQLiteBridge {
  db: InstanceType<typeof DatabaseSync>
  private transactionOpen = false
  constructor(path = ':memory:') { this.db = new DatabaseSync(path) }
  createConnection: CapacitorSQLitePlugin['createConnection'] = async () => {}
  open: CapacitorSQLitePlugin['open'] = async () => {}
  beginTransaction: CapacitorSQLitePlugin['beginTransaction'] = async () => {
    this.db.exec('BEGIN TRANSACTION')
    this.transactionOpen = true
    return { changes: { changes: 0 } }
  }
  commitTransaction: CapacitorSQLitePlugin['commitTransaction'] = async () => {
    this.db.exec('COMMIT')
    this.transactionOpen = false
    return { changes: { changes: 0 } }
  }
  rollbackTransaction: CapacitorSQLitePlugin['rollbackTransaction'] = async () => {
    this.db.exec('ROLLBACK')
    this.transactionOpen = false
    return { changes: { changes: 0 } }
  }
  closeConnection: CapacitorSQLitePlugin['closeConnection'] = async () => {
    if (this.transactionOpen) this.db.exec('ROLLBACK')
    this.transactionOpen = false
  }
  getVersion: CapacitorSQLitePlugin['getVersion'] = async () => ({
    version: Number(this.db.prepare('PRAGMA user_version').get()?.user_version),
  })
  query: CapacitorSQLitePlugin['query'] = async ({ statement = '', values }) => {
    // Native query requires values even though the published TS type makes it optional.
    if (!Array.isArray(values)) throw new Error('Query: Must provide an Array of value')
    const rows = this.db.prepare(statement).all(...values)
    // Match the raw iOS plugin's leading column-description row.
    return { values: [{ ios_columns: Object.keys(rows[0] ?? {}) }, ...rows] }
  }
  execute: CapacitorSQLitePlugin['execute'] = async ({ statements = '', transaction }) => {
    this.transact(() => this.db.exec(statements), transaction)
    return { changes: { changes: 0 } }
  }
  executeSet: CapacitorSQLitePlugin['executeSet'] = async ({ set = [], transaction }) => {
    this.transact(() => {
      for (const { statement = '', values = [] } of set) this.db.prepare(statement).run(...values)
    }, transaction)
    return { changes: { changes: set.length } }
  }
  private transact(action: () => void, transaction = true) {
    if (transaction) this.db.exec('BEGIN TRANSACTION')
    try {
      action()
      if (transaction) this.db.exec('COMMIT')
    } catch (error) {
      if (transaction) this.db.exec('ROLLBACK')
      throw error
    }
  }
}

const bridges: TestSQLiteBridge[] = []
const directories: string[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const bridge of bridges.splice(0)) bridge.db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})

function setup() {
  const bridge = new TestSQLiteBridge()
  bridges.push(bridge)
  return { bridge, storage: new SQLiteStorage(bridge) }
}

describe('SQLite storage contract', () => {
  it('does not treat the Capacitor plugin proxy as a promise', async () => {
    const { bridge } = setup()
    const proxy = new Proxy(bridge, {
      get(target, property, receiver) {
        if (property === 'then') return (_resolve: unknown, reject: (error: Error) => void) => {
          reject(new Error('Capacitor plugins do not implement then'))
        }
        return Reflect.get(target, property, receiver)
      },
    })
    expect(await new SQLiteStorage(proxy).getAllProgress()).toEqual([])
  })

  it('saves, overwrites, lists, logs, and resets durable records', async () => {
    const { storage } = setup()
    const progress = { ...createNewProgress('a'), introduced: true, reps: 1 }
    await storage.saveProgress(progress)
    await storage.saveProgress({ ...progress, reps: 2 })
    expect(await storage.getProgress('a')).toEqual({ ...progress, reps: 2 })
    expect(await storage.getProgress('missing')).toBeUndefined()
    expect(await storage.getAllProgress()).toEqual([{ ...progress, reps: 2 }])
    await storage.logConfusion({ targetId: 'a', chosenId: 'b', timestamp: 123 })
    expect(await storage.getConfusionLog()).toEqual([{ targetId: 'a', chosenId: 'b', timestamp: 123 }])
    await storage.clearAll()
    expect(await storage.getAllProgress()).toEqual([])
    expect(await storage.getConfusionLog()).toEqual([])
  })

  it('rejects an incomplete native read instead of presenting empty progress', async () => {
    const { bridge, storage } = setup()
    await storage.saveProgress(createNewProgress('a'))
    vi.spyOn(bridge, 'query').mockResolvedValueOnce({})
    await expect(storage.getAllProgress()).rejects.toThrow()
    expect(await storage.getAllProgress()).toEqual([createNewProgress('a')])
  })

  it('identifies malformed saved records and permits an explicit erase without changing the schema', async () => {
    const { bridge, storage } = setup()
    await storage.saveProgress(createNewProgress('a'))
    await storage.logConfusion({ targetId: 'a', chosenId: 'b', timestamp: 123 })
    bridge.db.exec("UPDATE progress SET stability = 'invalid'")
    await expect(storage.getAllProgress()).rejects.toMatchObject({ kind: 'corrupt' })
    expect(await storage.getConfusionLog()).toHaveLength(1)
    await storage.clearAll()
    expect(await storage.getAllProgress()).toEqual([])
    expect(await storage.getConfusionLog()).toEqual([])
    await storage.saveProgress(createNewProgress('b'))
    expect(await storage.getProgress('b')).toEqual(createNewProgress('b'))
  })

  it('bounds a stalled native initialization and prevents overlapping retry, save, or reset', async () => {
    const { bridge, storage } = setup()
    const saved = createNewProgress('a')
    await storage.saveProgress(saved)
    let finishOpen!: () => void
    vi.spyOn(bridge, 'open').mockImplementationOnce(() => new Promise<void>(resolve => { finishOpen = resolve }))
    const loadingApp = new SQLiteStorage(bridge)
    vi.useFakeTimers()
    const load = loadingApp.getAllProgress()
    const timedOut = expect(load).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(15_000)
    await timedOut
    await expect(loadingApp.getAllProgress()).rejects.toMatchObject({ kind: 'timeout' })
    await expect(loadingApp.saveProgress(createNewProgress('b'))).rejects.toMatchObject({ kind: 'timeout' })
    await expect(loadingApp.clearAll()).rejects.toMatchObject({ kind: 'timeout' })
    // A late result releases the barrier, but does not publish stale data to the UI.
    finishOpen()
    await vi.advanceTimersByTimeAsync(0)
    expect(await loadingApp.getAllProgress()).toEqual([saved])
    expect(await loadingApp.getProgress('b')).toBeUndefined()
  })

  it('round-trips FSRS values, timestamps, Unicode IDs, and cleared optional fields', async () => {
    const { storage } = setup()
    const progress = {
      speciesId: "bird's 🐦", introduced: true, introducedAt: 1735689600000,
      stability: 12.3456789, difficulty: 6.5, elapsedDays: 3, scheduledDays: 8,
      reps: 4, lapses: 2, state: 'relearning' as const,
      lastReview: 1735689600123, nextReview: 1736380800000,
    }
    await storage.saveProgressBatch([progress, createNewProgress('b')])
    expect(await storage.getProgress(progress.speciesId)).toEqual(progress)
    expect(await storage.getAllProgress()).toHaveLength(2)
    const withoutDates = { ...progress, introducedAt: undefined, lastReview: undefined, nextReview: undefined }
    await storage.saveProgress(withoutDates)
    expect(await storage.getProgress(progress.speciesId)).toEqual(withoutDates)
    await storage.saveProgressBatch([])
    expect(await storage.getAllProgress()).toHaveLength(2)
  })

  it('keeps every confusion, including duplicate timestamps, in insertion order', async () => {
    const { storage } = setup()
    const first = { targetId: 'a', chosenId: 'b', timestamp: 123 }
    const second = { targetId: 'b', chosenId: 'c', timestamp: 100 }
    await storage.logConfusion(first)
    await storage.logConfusion(first)
    await storage.logConfusion(second)
    expect(await storage.getConfusionLog()).toEqual([first, first, second])
  })

  it('rolls back every lesson record when one write fails and permits retry', async () => {
    const { bridge, storage } = setup()
    const existing = { ...createNewProgress('a'), reps: 1 }
    await storage.saveProgress(existing)
    bridge.db.exec(`CREATE TRIGGER fail_lesson BEFORE INSERT ON progress
      WHEN NEW.speciesId = 'b' BEGIN SELECT RAISE(ABORT, 'disk full'); END`)
    const batch = [{ ...existing, reps: 2 }, createNewProgress('b')]
    await expect(storage.saveProgressBatch(batch)).rejects.toThrow('disk full')
    expect(await storage.getAllProgress()).toEqual([existing])
    bridge.db.exec('DROP TRIGGER fail_lesson')
    await storage.saveProgressBatch(batch)
    expect(await storage.getAllProgress()).toEqual(batch)
  })

  it('rolls back progress deletion when clearing confusions fails', async () => {
    const { bridge, storage } = setup()
    const existing = createNewProgress('a')
    const confusion = { targetId: 'a', chosenId: 'b', timestamp: 123 }
    await storage.saveProgress(existing)
    await storage.logConfusion(confusion)
    bridge.db.exec(`CREATE TRIGGER fail_reset BEFORE DELETE ON confusions
      BEGIN SELECT RAISE(ABORT, 'reset failed'); END`)
    await expect(storage.clearAll()).rejects.toThrow('reset failed')
    expect(await storage.getAllProgress()).toEqual([existing])
    expect(await storage.getConfusionLog()).toEqual([confusion])
    bridge.db.exec('DROP TRIGGER fail_reset')
    await storage.clearAll()
    expect(await storage.getAllProgress()).toEqual([])
    expect(await storage.getConfusionLog()).toEqual([])
  })

  it.each(['createConnection', 'open', 'getVersion', 'execute'] as const)(
    'recovers from a failed %s without losing existing records', async operation => {
      const { bridge, storage } = setup()
      vi.spyOn(bridge, operation).mockRejectedValueOnce(new Error('unavailable'))
      await expect(storage.getAllProgress()).rejects.toThrow('unavailable')
      await storage.saveProgress(createNewProgress('a'))
      const reopened = new SQLiteStorage(bridge)
      expect(await reopened.getAllProgress()).toEqual([createNewProgress('a')])
    },
  )

  it('leaves a failed schema initialization retryable and atomic', async () => {
    const { bridge, storage } = setup()
    const execute = bridge.execute.bind(bridge)
    vi.spyOn(bridge, 'execute').mockImplementationOnce(options => execute({
      ...options, statements: `${options.statements} INVALID SQL;`,
    }))
    await expect(storage.getAllProgress()).rejects.toThrow()
    await storage.saveProgress(createNewProgress('a'))
    expect(await storage.getAllProgress()).toEqual([createNewProgress('a')])
  })

  it('rejects a database from a newer release and never resets it', async () => {
    const { bridge, storage } = setup()
    await storage.saveProgress(createNewProgress('a'))
    bridge.db.exec('PRAGMA user_version = 2')
    const olderApp = new SQLiteStorage(bridge)
    await expect(olderApp.getAllProgress()).rejects.toMatchObject({ kind: 'newer-schema' })
    await expect(olderApp.clearAll()).rejects.toThrow()
    expect(await storage.getProgress('a')).toEqual(createNewProgress('a'))
  })

  it('reports read and write failures while retaining committed progress and history', async () => {
    const { bridge, storage } = setup()
    const progress = createNewProgress('a')
    const event = { targetId: 'a', chosenId: 'b', timestamp: 123 }
    await storage.saveProgress(progress)
    await storage.logConfusion(event)
    for (const load of [() => storage.getProgress('a'), () => storage.getAllProgress(), () => storage.getConfusionLog()]) {
      vi.spyOn(bridge, 'query').mockRejectedValueOnce(new Error('unavailable'))
      await expect(load()).rejects.toThrow('unavailable')
    }
    for (const save of [() => storage.saveProgress({ ...progress, reps: 9 }), () => storage.logConfusion(event)]) {
      vi.spyOn(bridge, 'executeSet').mockRejectedValueOnce(new Error('disk full'))
      await expect(save()).rejects.toThrow('disk full')
    }
    expect(await storage.getProgress('a')).toEqual(progress)
    expect(await storage.getConfusionLog()).toEqual([event])
  })

  it('preserves progress and history after closing the database and opening a new app instance', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'beakspeak-storage-'))
    directories.push(directory)
    const path = join(directory, 'progress.db')
    const bridge = new TestSQLiteBridge(path)
    bridges.push(bridge)
    const storage = new SQLiteStorage(bridge)
    const progress = { ...createNewProgress('a'), reps: 5 }
    const event = { targetId: 'a', chosenId: 'b', timestamp: 123 }
    await storage.saveProgress(progress)
    await storage.logConfusion(event)
    bridge.db.close()
    bridge.db = new DatabaseSync(path)
    const updatedApp = new SQLiteStorage(bridge)
    expect(await updatedApp.getAllProgress()).toEqual([progress])
    expect(await updatedApp.getConfusionLog()).toEqual([event])
  })

  it('serializes reset with simultaneous saves', async () => {
    const { storage } = setup()
    await Promise.all([
      storage.saveProgress(createNewProgress('a')),
      storage.logConfusion({ targetId: 'a', chosenId: 'b', timestamp: 123 }),
      storage.clearAll(),
      storage.saveProgress(createNewProgress('b')),
    ])
    expect(await storage.getAllProgress()).toEqual([createNewProgress('b')])
    expect(await storage.getConfusionLog()).toEqual([])
  })

  it('rolls back a failed native commit before subsequent reads or retries', async () => {
    const { bridge, storage } = setup()
    const existing = createNewProgress('a')
    await storage.saveProgress(existing)
    // Native COMMIT can reject while the actual SQLite transaction remains open.
    vi.spyOn(bridge, 'commitTransaction').mockRejectedValueOnce(new Error('SQLITE_BUSY at commit'))
    await expect(storage.saveProgress({ ...existing, reps: 9 })).rejects.toThrow('SQLITE_BUSY')
    expect(await storage.getAllProgress()).toEqual([existing])
    await storage.saveProgress({ ...existing, reps: 2 })
    expect(await storage.getProgress('a')).toEqual({ ...existing, reps: 2 })
  })

  it('recovers safely when both commit and rollback fail, blocking reads until close succeeds', async () => {
    const { bridge, storage } = setup()
    const existing = createNewProgress('a')
    await storage.saveProgress(existing)
    vi.spyOn(bridge, 'commitTransaction').mockRejectedValueOnce(new Error('commit failed'))
    vi.spyOn(bridge, 'rollbackTransaction').mockRejectedValueOnce(new Error('rollback failed'))
    await expect(storage.saveProgress({ ...existing, reps: 9 })).rejects.toThrow('commit failed')
    vi.spyOn(bridge, 'closeConnection').mockRejectedValueOnce(new Error('close failed'))
    await expect(storage.getAllProgress()).rejects.toThrow('close failed')
    expect(await storage.getAllProgress()).toEqual([existing])
    await storage.saveProgress({ ...existing, reps: 2 })
    expect(await storage.getProgress('a')).toEqual({ ...existing, reps: 2 })
  })

  it('rolls back schema creation when its commit fails and permits initialization retry', async () => {
    const { bridge, storage } = setup()
    vi.spyOn(bridge, 'commitTransaction').mockRejectedValueOnce(new Error('commit failed'))
    await expect(storage.getAllProgress()).rejects.toThrow('commit failed')
    expect(await storage.getAllProgress()).toEqual([])
    await storage.saveProgress(createNewProgress('a'))
    expect(await storage.getAllProgress()).toEqual([createNewProgress('a')])
  })
})
