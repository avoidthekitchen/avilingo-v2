import { Capacitor } from '@capacitor/core'
import { DexieStorage, type StorageAdapter } from './storage'
import { SQLiteStorage } from './sqliteStorage'

export function createStorage(): StorageAdapter {
  return Capacitor.isNativePlatform() ? new SQLiteStorage() : new DexieStorage()
}
