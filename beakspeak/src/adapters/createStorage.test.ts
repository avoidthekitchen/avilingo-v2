import { afterEach, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { createStorage } from './createStorage'
import { DexieStorage } from './storage'
import { SQLiteStorage } from './sqliteStorage'

afterEach(() => vi.restoreAllMocks())

it('selects Dexie in the browser and SQLite in the native app', () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
  expect(createStorage()).toBeInstanceOf(DexieStorage)
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  expect(createStorage()).toBeInstanceOf(SQLiteStorage)
})
