import { expect, test } from './fixtures'

// The fixture fails the test on any request that leaves the app origin, so this
// journey also proves no photo is fetched from Wikimedia.
test('bundled bird photos load from the app throughout the learner journey', async ({ app, page }) => {
  await app.resetProgress()

  await page.getByRole('button', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'Credits & Attribution' })).toBeVisible()
  await app.expectBundledPhotosLoaded(15)

  await app.gotoHome()
  await app.expectBundledPhotosLoaded(15)

  await page.getByRole('button', { name: /Lesson 1: The unmistakable three/i }).click()
  await expect(page.getByRole('heading', { name: 'American Crow' })).toBeVisible()
  await app.expectBundledPhotosLoaded()

  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.getByRole('heading', { name: "Steller's Jay" })).toBeVisible()
  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.getByRole('heading', { name: 'Northern Flicker' })).toBeVisible()
  await page.getByRole('button', { name: /Start Quiz/i }).click()

  await expect(page.getByText('Question 1 of 5')).toBeVisible()
  await app.expectBundledPhotosLoaded(3)
  await app.answerIntroQuiz()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('3 of 15 birds introduced')).toBeVisible()

  await page.getByRole('button', { name: /Progress/ }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await app.expectBundledPhotosLoaded(15)

  await page.getByRole('button', { name: /Start Review \(3 due\)/i }).click()
  await page.getByRole('button', { name: 'Start Review' }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()
  await app.expectBundledPhotosLoaded(3)

  for (let answer = 1; answer <= 3; answer += 1) {
    await page.getByRole('button', { name: /^(American Crow|Steller's Jay|Northern Flicker)$/ }).first().click()

    const nextButton = page.getByRole('button', { name: 'Next' })
    const resultsHeading = page.getByRole('heading', { name: /\d+ \/ 3/ })
    await expect(nextButton.or(resultsHeading).or(page.getByText(`${answer + 1} / 3`))).toBeVisible({
      timeout: 3_000,
    })
    if (await nextButton.isVisible()) await nextButton.click()
  }

  await expect(page.getByRole('heading', { name: /\d+ \/ 3/ })).toBeVisible()
  await app.expectBundledPhotosLoaded()
})

// Guards the helper itself: a photo that falls back after it rendered must not
// slip out of the check by no longer matching the photo selector.
test('the bundled-photo check fails when a photo falls back late', async ({ app, page }) => {
  await page.route('**/content/bird-photos/amcr-*.jpg', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000))
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: 'corrupt photo' })
  })

  await app.resetProgress()
  await page.getByRole('button', { name: 'About' }).click()
  await expect(page.getByRole('heading', { name: 'Credits & Attribution' })).toBeVisible()
  await expect(app.expectBundledPhotosLoaded(15)).rejects.toThrow(/fallbacks/)
  await expect(page.locator('[data-photo-fallback="true"]')).toHaveCount(1)
})
