import Dexie from 'dexie';
import type { UserProgress, ConfusionEvent } from '../core/types';

export interface StorageAdapter {
  getProgress(speciesId: string): Promise<UserProgress | undefined>;
  saveProgress(progress: UserProgress): Promise<void>;
  getAllProgress(): Promise<UserProgress[]>;
  getConfusionLog(): Promise<ConfusionEvent[]>;
  logConfusion(event: ConfusionEvent): Promise<void>;
  clearAll(): Promise<void>;
}

class BirdsongDB extends Dexie {
  progress!: Dexie.Table<UserProgress, string>;
  confusions!: Dexie.Table<ConfusionEvent, number>;

  constructor() {
    super('birdsong');
    this.version(1).stores({
      progress: 'speciesId, state, nextReview',
      confusions: '++id, timestamp, targetId, chosenId',
    });
  }
}

const db = new BirdsongDB();

export class DexieStorage implements StorageAdapter {
  async getProgress(speciesId: string): Promise<UserProgress | undefined> {
    return db.progress.get(speciesId);
  }

  async saveProgress(progress: UserProgress): Promise<void> {
    await db.progress.put(progress);
  }

  async getAllProgress(): Promise<UserProgress[]> {
    return db.progress.toArray();
  }

  async getConfusionLog(): Promise<ConfusionEvent[]> {
    return db.confusions.toArray();
  }

  async logConfusion(event: ConfusionEvent): Promise<void> {
    await db.confusions.add(event);
  }

  async clearAll(): Promise<void> {
    await db.progress.clear();
    await db.confusions.clear();
  }
}
