import { expect, test } from './fixtures'

test('failed bird photos use the bundled fallback throughout the learner journey', async ({ app, page }) => {
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({
    status: 200,
    contentType: 'image/jpeg',
    body: 'unavailable photo',
  }))

  await app.resetProgress()
  await page.getByRole('button', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'Credits & Attribution' })).toBeVisible()
  await expect(page.getByRole('img', { name: /photo unavailable$/ })).toHaveCount(15)

  await app.completeLessonOne()

  await page.getByRole('button', { name: /Progress/ }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('img', { name: /photo unavailable$/ })).toHaveCount(15)

  await page.getByRole('button', { name: /Start Review \(3 due\)/i }).click()
  await page.getByRole('button', { name: 'Start Review' }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()
  await expect(page.getByRole('img', { name: /photo unavailable$/ })).toHaveCount(3)

  for (let answer = 1; answer <= 3; answer += 1) {
    await page.locator('button').filter({ has: page.locator('img') }).first().click()

    const nextButton = page.getByRole('button', { name: 'Next' })
    const resultsHeading = page.getByRole('heading', { name: /\d+ \/ 3/ })
    await expect(nextButton.or(resultsHeading).or(page.getByText(`${answer + 1} / 3`))).toBeVisible({
      timeout: 3_000,
    })
    if (await nextButton.isVisible()) await nextButton.click()
  }

  await expect(page.getByRole('heading', { name: /\d+ \/ 3/ })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await page.getByRole('button', { name: /Progress/ }).click()
  await expect(page.getByText('1 reps')).toHaveCount(3)
})
