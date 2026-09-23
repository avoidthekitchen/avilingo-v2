import { expect, test } from './fixtures'

// The Same/Different exercise only appears once a bird has three repetitions, which the
// learner journey spec never reaches. Seeding the repetition count directly in the
// persisted progress record lets the real sequenced playback (clip 1, pause, clip 2)
// and answer flow run end to end in the browser.
async function seedRepetitions(page: import('@playwright/test').Page, reps: number) {
  await page.evaluate(async (repsToSeed) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('beakspeak')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const store = db.transaction('progress', 'readwrite').objectStore('progress')
    const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    for (const record of records) {
      if (record.introduced) store.put({ ...record, reps: repsToSeed })
    }
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, reps)
}

test('review serves Same/Different questions to well-practised birds', async ({ app, page }) => {
  // Three sequenced questions each play two clips with a pause; allow for it.
  test.setTimeout(180_000)
  await app.resetProgress()
  await app.completeLessonOne()
  await seedRepetitions(page, 3)

  await page.reload()
  await page.getByRole('button', { name: /Quiz/ }).click()
  await page.getByRole('button', { name: 'Start Review' }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()

  for (let question = 1; question <= 3; question += 1) {
    await expect(page.getByText(`${question} / 3`)).toBeVisible()
    await expect(page.getByText('Same species or different?')).toBeVisible()

    const same = page.getByRole('button', { name: 'Same', exact: true })
    const different = page.getByRole('button', { name: 'Different', exact: true })
    await expect(same).toBeDisabled()

    // Both clips must finish (each under ten seconds, plus the pause) before answering opens.
    await expect(page.getByText('Your turn')).toBeVisible({ timeout: 30_000 })
    await expect(same).toBeEnabled()
    await expect(different).toBeEnabled()
    await expect(page.getByRole('status').filter({ hasText: 'Audio didn' })).toHaveCount(0)

    await same.click()
    await expect(same).toBeDisabled()

    const nextButton = page.getByRole('button', { name: 'Next' })
    const resultsHeading = page.getByRole('heading', { name: /\d+ \/ 3/ })
    const nextQuestion = page.getByText(`${question + 1} / 3`)
    await expect(nextButton.or(resultsHeading).or(nextQuestion)).toBeVisible({ timeout: 5_000 })
    if (await nextButton.isVisible()) await nextButton.click()
  }

  await expect(page.getByRole('heading', { name: /\d+ \/ 3/ })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home' }).click()

  await page.getByRole('button', { name: /Progress/ }).click()
  await expect(page.getByText('4 reps')).toHaveCount(3)
})
