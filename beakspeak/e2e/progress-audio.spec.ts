import { expect, test } from './fixtures'

// The Progress tab is the only place every bundled clip is reachable without a lesson.
// This drives the real WebAudio path in the browser: fetch, decode, play, stop, and a
// natural end that returns the control to its idle state.
test('Progress tab plays, stops, and finishes a bundled clip', async ({ app, page }) => {
  await app.resetProgress()

  const firstBird = page.locator('main').getByRole('button', { name: 'Song' }).first()
  const firstCall = page.locator('main').getByRole('button', { name: 'Call' }).first()

  await firstBird.click()
  await expect(firstBird).toContainText('⏹')
  await expect(firstBird).toBeEnabled()

  // Starting another clip stops the first one.
  await firstCall.click()
  await expect(firstCall).toContainText('⏹')
  await expect(firstBird).toContainText('▶')

  // Tapping the active clip stops it immediately.
  await firstCall.click()
  await expect(firstCall).toContainText('▶')

  // A clip left alone ends on its own; every production clip is under ten seconds.
  await firstBird.click()
  await expect(firstBird).toContainText('⏹')
  await expect(firstBird).toContainText('▶', { timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Audio didn' })).toHaveCount(0)
})
