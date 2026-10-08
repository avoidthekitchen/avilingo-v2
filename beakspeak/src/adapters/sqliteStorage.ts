import type { CapacitorSQLitePlugin, capSQLiteSet } from '@capacitor-community/sqlite'
import { registerPlugin } from '@capacitor/core'
import type { StorageAdapter } from './storage'
import type { ConfusionEvent, UserProgress } from '../core/types'
import {
  databaseName, schemaVersion, migrations, progressValues,
  readProgress, readConfusion, readRows, saveProgressStatement, statements, confusionValues,
} from './sqliteSchema'

type SQLiteBridge = Pick<CapacitorSQLitePlugin,
  'createConnection' | 'closeConnection' | 'open' | 'getVersion' | 'query' | 'execute' | 'executeSet' |
  'beginTransaction' | 'commitTransaction' | 'rollbackTransaction'>

const storagePolicy = registerPlugin<{ prepare(): Promise<void> }>('BeakSpeakStorage')

function queryRows(values: unknown): Record<string, unknown>[] {
  const rows = readRows(values)
  // Raw iOS queries include column metadata before the actual records.
  return Array.isArray(rows[0]?.ios_columns) ? rows.slice(1) : rows
}

export class SQLiteStorage implements StorageAdapter {
  private bridge?: SQLiteBridge
  private connectionCreated = false
  private opened = false
  private initialized = false
  private needsRecovery = false
  private queue: Promise<void> = Promise.resolve()

  constructor(bridge?: SQLiteBridge) {
    this.bridge = bridge
  }

  // Capacitor proxies expose a synthetic `then`; never return one from an async function.
  private async initialize(): Promise<void> {
    if (!this.bridge) {
      await storagePolicy.prepare()
      // Load only when native storage is used. Browser builds keep Dexie.
      const { CapacitorSQLite } = await import('@capacitor-community/sqlite')
      // Dispose orphan connections left by a WebView reload, never their data.
      await CapacitorSQLite.checkConnectionsConsistency({ dbNames: [], openModes: [] })
      this.bridge = CapacitorSQLite
    }
    const bridge = this.bridge
    if (this.needsRecovery) {
      // Closing rolls back unfinished work. If closing fails, keep blocking reads
      // and writes until a later retry can recover the connection safely.
      await bridge.closeConnection({ database: databaseName, readonly: false })
      this.connectionCreated = false
      this.opened = false
      this.initialized = false
      this.needsRecovery = false
    }
    if (!this.connectionCreated) {
      await bridge.createConnection({
        database: databaseName, version: schemaVersion,
        encrypted: false, mode: 'no-encryption', readonly: false,
      })
      this.connectionCreated = true
    }
    if (!this.opened) {
      await bridge.open({ database: databaseName, readonly: false })
      this.opened = true
    }
    if (!this.initialized) {
      const { version } = await bridge.getVersion({ database: databaseName })
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > schemaVersion) {
        throw new Error('Unsupported saved database version')
      }
      for (const migration of migrations) {
        if (migration.version > version) {
          await this.transaction(bridge, async () => {
            const { changes } = await bridge.execute({ database: databaseName, statements: migration.statements, transaction: false })
            if (changes?.changes == null || changes.changes < 0) throw new Error('Database upgrade failed')
          })
        }
      }
      this.initialized = true
    }
  }

  // Native calls are asynchronous. Serialize whole operations so reset and batches
  // cannot interleave; a rejected operation must not poison later retries.
  private run<T>(operation: (bridge: SQLiteBridge) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.initialize()
      const bridge = this.bridge
      if (!bridge) throw new Error('Native storage is unavailable')
      return operation(bridge)
    })
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  getProgress(speciesId: string): Promise<UserProgress | undefined> {
    return this.run(async bridge => {
      const { values } = await bridge.query({
        database: databaseName, statement: statements.getProgress, values: [speciesId],
      })
      const rows = queryRows(values)
      return rows.length ? readProgress(rows[0]) : undefined
    })
  }

  saveProgress(progress: UserProgress): Promise<void> {
    return this.saveProgressBatch([progress])
  }

  saveProgressBatch(progress: UserProgress[]): Promise<void> {
    return this.run(async bridge => {
      if (!progress.length) return
      await this.write(bridge, progress.map(record => ({
        statement: saveProgressStatement, values: progressValues(record),
      })))
    })
  }

  getAllProgress(): Promise<UserProgress[]> {
    return this.run(async bridge => {
      const { values } = await bridge.query({ database: databaseName, statement: statements.getAllProgress, values: [] })
      return queryRows(values).map(readProgress)
    })
  }

  getConfusionLog(): Promise<ConfusionEvent[]> {
    return this.run(async bridge => {
      const { values } = await bridge.query({ database: databaseName, statement: statements.getConfusionLog, values: [] })
      return queryRows(values).map(readConfusion)
    })
  }

  logConfusion(event: ConfusionEvent): Promise<void> {
    return this.run(bridge => this.write(bridge, [{
      statement: statements.logConfusion, values: confusionValues(event),
    }]))
  }

  clearAll(): Promise<void> {
    return this.run(bridge => this.write(bridge, [
      { statement: statements.clearProgress, values: [] },
      { statement: statements.clearConfusions, values: [] },
    ]))
  }

  private async write(bridge: SQLiteBridge, set: capSQLiteSet[]): Promise<void> {
    await this.transaction(bridge, async () => {
      const { changes } = await bridge.executeSet({ database: databaseName, set, transaction: false })
      if (changes?.changes == null || changes.changes < 0) throw new Error('Database write failed')
    })
  }

  private async transaction(bridge: SQLiteBridge, operation: () => Promise<void>): Promise<void> {
    try {
      await bridge.beginTransaction({ database: databaseName })
      await operation()
      await bridge.commitTransaction({ database: databaseName })
    } catch (error) {
      // The plugin's implicit transaction path omits rollback on COMMIT failure.
      // Own the transaction so a failed save never exposes uncommitted records.
      try {
        await bridge.rollbackTransaction({ database: databaseName })
      } catch {
        this.needsRecovery = true
      }
      throw error
    }
  }
}
