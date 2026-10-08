import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

// Inject failures at the external Capacitor bridge. This exercises the production
// adapter/store/UI in a browser, not the iOS plugin or physical-device gate.
async function installNativeStorageFixture(page: Page, failure: 'corrupt' | 'newer-schema' | 'timeout') {
  await page.addInitScript(mode => {
    let pendingErase = false
    let finishLoad: (() => void) | undefined
    let signalLoad!: () => void
    const loadingStarted = new Promise<void>(resolve => { signalLoad = resolve })
    const native = window as unknown as {
      webkit: unknown
      Capacitor: unknown
      storageFixture: { loadingStarted: Promise<void>; finishLoad(): void }
    }
    native.webkit = { messageHandlers: { bridge: {} } }
    native.storageFixture = { loadingStarted, finishLoad: () => finishLoad?.() }
    native.Capacitor = {
      PluginHeaders: [
        { name: 'App', methods: ['addListener', 'removeListener'].map(name => ({ name, rtype: 'promise' })) },
        { name: 'BeakSpeakStorage', methods: [{ name: 'prepare', rtype: 'promise' }] },
        { name: 'CapacitorSQLite', methods: [
          'checkConnectionsConsistency', 'createConnection', 'closeConnection', 'open', 'getVersion',
          'query', 'beginTransaction', 'executeSet', 'commitTransaction', 'rollbackTransaction',
        ].map(name => ({ name, rtype: 'promise' })) },
      ],
      nativePromise: async (plugin: string, method: string) => {
        if (plugin === 'App') return 'fixture-listener'
        if (plugin === 'BeakSpeakStorage') return
        if (method === 'checkConnectionsConsistency') return { result: false }
        if (method === 'getVersion') return { version: mode === 'newer-schema' ? 2 : 1 }
        if (method === 'query') {
          if (mode === 'timeout' && !sessionStorage.getItem('native-load-finished')) {
            signalLoad()
            return new Promise(resolve => {
              finishLoad = () => {
                sessionStorage.setItem('native-load-finished', '1')
                resolve({ values: [] })
              }
            })
          }
          if (mode === 'corrupt' && !sessionStorage.getItem('native-records-erased')) {
            return { values: [{
              speciesId: 'a', introduced: 1, state: 'new', stability: 'invalid',
              difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0,
            }] }
          }
          return { values: [] }
        }
        if (method === 'beginTransaction') pendingErase = false
        if (method === 'executeSet') pendingErase = true
        if (method === 'commitTransaction' && pendingErase) sessionStorage.setItem('native-records-erased', '1')
        if (method === 'rollbackTransaction') pendingErase = false
        return { changes: { changes: 0 } }
      },
    }
  }, failure)
}

test('corrupt native records require a separate erase confirmation and recover to a clean Guided Path', async ({ page }) => {
  await installNativeStorageFixture(page, 'corrupt')
  await page.goto('/beakspeak/')
  await expect(page.getByRole('alert')).toContainText('Some saved progress could not be read')
  await page.getByRole('button', { name: 'Erase saved progress and start over' }).click()
  await expect(page.getByRole('group', { name: 'Erase all saved progress?' })).toContainText('cannot be undone')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Retry loading progress' }).click()
  await expect(page.getByRole('alert')).toContainText('Some saved progress could not be read')
  await page.getByRole('button', { name: 'Erase saved progress and start over' }).click()
  await page.getByRole('button', { name: 'Yes, erase saved progress' }).click()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  await expect(page.getByText('0 of 15 birds introduced')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  await expect(page.getByText('0 of 15 birds introduced')).toBeVisible()
})

test('newer native data directs the learner to update and stays protected from erasure', async ({ page }) => {
  await installNativeStorageFixture(page, 'newer-schema')
  await page.goto('/beakspeak/')
  await expect(page.getByRole('alert')).toContainText('newer version of BeakSpeak')
  await expect(page.getByRole('alert')).toContainText('Update the app')
  await expect(page.getByRole('button', { name: /Erase saved progress/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry loading progress' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Listen to bird sounds' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset All Progress' })).toHaveCount(0)
})

test('a stalled native load leaves the loader and permits retry only after the pending call settles', async ({ page }) => {
  await page.clock.install()
  await installNativeStorageFixture(page, 'timeout')
  await page.goto('/beakspeak/')
  await page.evaluate(() => (window as unknown as { storageFixture: { loadingStarted: Promise<void> } }).storageFixture.loadingStarted)
  await page.clock.fastForward(15_000)
  await expect(page.getByRole('alert')).toContainText('Loading saved progress took too long')
  const retry = page.getByRole('button', { name: 'Retry loading progress' })
  await retry.click()
  await expect(retry).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('Loading saved progress took too long')
  await expect(page.getByRole('button', { name: /Erase saved progress/ })).toHaveCount(0)
  await page.evaluate(() => (window as unknown as { storageFixture: { finishLoad(): void } }).storageFixture.finishLoad())
  await expect(page.getByRole('alert')).toContainText('Loading saved progress took too long')
  await retry.click()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
})
