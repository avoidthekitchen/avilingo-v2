import { test, expect } from './fixtures'

test('tab taps during a lesson ask before abandoning it', async ({ app, page }) => {
  await app.gotoHome()
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  await expect(page.getByRole('heading', { name: 'American Crow' })).toBeVisible()
  for (const button of await page.getByRole('navigation').getByRole('button').all()) await expect(button).toBeEnabled()

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Leave this lesson?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Keep learning' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Keep learning' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'American Crow' })).toBeVisible()

  await page.getByRole('button', { name: /Next/i }).click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: "Steller's Jay" })).toBeVisible()

  await page.getByRole('button', { name: 'Learn', exact: true }).click()
  await dialog.getByRole('button', { name: 'Leave lesson' }).click()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()

  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  await page.getByRole('button', { name: /← Back/ }).click()
  await dialog.getByRole('button', { name: 'Leave lesson' }).click()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  await expect(page.getByText('0 of 15 birds introduced')).toBeVisible()
})

test('leaving a review from the tab bar keeps saved answers and opens the tapped tab', async ({ app, page }) => {
  await app.completeLessonOne()
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await page.getByRole('button', { name: 'Start Review', exact: true }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()

  await page.getByRole('button', { name: /← Quit/ }).click()
  const dialog = page.getByRole('alertdialog', { name: 'End this review?' })
  await expect(dialog).toContainText('Answers so far are saved.')
  await dialog.getByRole('button', { name: 'Keep going' }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await dialog.getByRole('button', { name: 'End review' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByText('0 reps')).toHaveCount(15)

  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start Review', exact: true })).toBeVisible()
})
