import { test, expect } from './fixtures'

test('sessions require their explicit exit before another tab can be opened', async ({ app, page }) => {
  await app.gotoHome()
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  await expect(page.getByRole('heading', { name: 'American Crow' })).toBeVisible()
  for (const button of await page.getByRole('navigation').getByRole('button').all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: /← Back/ }).click()
  await expect(page.getByRole('button', { name: 'Progress', exact: true })).toBeEnabled()
  await app.completeLessonOne()
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await page.getByRole('button', { name: 'Start Review', exact: true }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()
  for (const button of await page.getByRole('navigation').getByRole('button').all()) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: /← Quit/ }).click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByText('0 reps')).toHaveCount(15)
})
