import Dexie from 'dexie'
import type { UserProgress, ConfusionEvent } from '../core/types'

export interface StorageAdapter {
  getProgress(speciesId: string): Promise<UserProgress | undefined>
  saveProgress(progress: UserProgress): Promise<void>
  getAllProgress(): Promise<UserProgress[]>
  getConfusionLog(): Promise<ConfusionEvent[]>
  logConfusion(event: ConfusionEvent): Promise<void>
  clearAll(): Promise<void>
}

class BeakSpeakDB extends Dexie {
  progress!: Dexie.Table<UserProgress, string>
  confusions!: Dexie.Table<ConfusionEvent, number>

  constructor() {
    super('beakspeak')
    this.version(1).stores({
      progress: 'speciesId, state, nextReview',
      confusions: '++id, timestamp',
    })
  }
}

export class DexieStorage implements StorageAdapter {
  private db: BeakSpeakDB

  constructor() {
    this.db = new BeakSpeakDB()
  }

  async getProgress(speciesId: string): Promise<UserProgress | undefined> {
    return this.db.progress.get(speciesId)
  }

  async saveProgress(progress: UserProgress): Promise<void> {
    await this.db.progress.put(progress)
  }

  async getAllProgress(): Promise<UserProgress[]> {
    return this.db.progress.toArray()
  }

  async getConfusionLog(): Promise<ConfusionEvent[]> {
    return this.db.confusions.toArray()
  }

  async logConfusion(event: ConfusionEvent): Promise<void> {
    await this.db.confusions.add(event)
  }

  async clearAll(): Promise<void> {
    await this.db.progress.clear()
    await this.db.confusions.clear()
  }
}
