import { expect, test } from './fixtures'

test('unreadable progress keeps bird sounds available and recovers saved data', async ({ app, page }) => {
  await app.resetProgress()
  await app.completeLessonOne()
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB)
    indexedDB.open = (name, version) => {
      if (sessionStorage.getItem('fail-progress-read') === '1') throw new DOMException('unavailable', 'UnknownError')
      return open(name, version)
    }
  })
  await page.evaluate(() => sessionStorage.setItem('fail-progress-read', '1'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Saved progress')
  await page.getByRole('button', { name: 'Listen to bird sounds' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset All Progress' })).toHaveCount(0)
  const song = page.getByRole('button', { name: 'Song' }).first()
  await song.click()
  await expect(song).toContainText('⏹')
  await song.click()
  await page.evaluate(() => sessionStorage.removeItem('fail-progress-read'))
  await page.getByRole('button', { name: 'Retry loading progress' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await expect(page.getByText('3 of 15 birds introduced')).toBeVisible()
})

test('a failed lesson save can be retried without replaying its quiz', async ({ app, page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'progress' && sessionStorage.getItem('fail-lesson-save') === '1') {
        sessionStorage.removeItem('fail-lesson-save')
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return put.call(this, value, key)
    }
  })
  await app.resetProgress()
  await app.gotoHome()
  await page.evaluate(() => sessionStorage.setItem('fail-lesson-save', '1'))
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  await page.getByRole('button', { name: /Next/i }).click()
  await page.getByRole('button', { name: /Next/i }).click()
  await page.getByRole('button', { name: /Start Quiz/i }).click()
  await app.answerIntroQuiz(5, page.getByRole('alert'))
  await expect(page.getByRole('alert')).toContainText('lesson could not be saved')
  await page.getByRole('button', { name: 'Retry saving' }).click()
  await expect(page.getByRole('heading', { name: 'Lesson Complete!' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('3 of 15 birds introduced')).toBeVisible()
  await page.reload()
  await expect(page.getByText('3 of 15 birds introduced')).toBeVisible()
})


test('a failed reset stays recoverable and a retry clears saved progress', async ({ app, page }) => {
  await page.addInitScript(() => {
    const clear = IDBObjectStore.prototype.clear
    IDBObjectStore.prototype.clear = function () {
      if (this.name === 'confusions' && sessionStorage.getItem('fail-reset') === '1') {
        sessionStorage.removeItem('fail-reset')
        throw new DOMException('failed', 'UnknownError')
      }
      return clear.call(this)
    }
  })
  await app.resetProgress()
  await app.completeLessonOne()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.evaluate(() => sessionStorage.setItem('fail-reset', '1'))
  await page.getByRole('button', { name: 'Reset All Progress' }).click()
  await page.getByRole('button', { name: 'Yes, Reset' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be reset')
  await page.getByRole('button', { name: 'Retry reset' }).click()
  await expect(page.getByRole('button', { name: 'Reset All Progress' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('0 of 15 birds introduced')).toBeVisible()
})
