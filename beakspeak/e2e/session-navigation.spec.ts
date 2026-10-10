import { test, expect } from './fixtures'

const lessonChoices = /American Crow|Steller's Jay|Northern Flicker/

test('cancelling without a focused opener leaves the bird heading untouched', async ({ app, page }) => {
  await app.gotoHome()
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  const heading = page.getByRole('heading', { name: 'American Crow' })
  await expect(heading).toBeVisible()
  // Reproduce a touch opener that dispatches a click without receiving DOM focus.
  await page.getByRole('button', { name: 'Progress', exact: true }).evaluate(button => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    button.click()
  })
  const dialog = page.getByRole('alertdialog', { name: 'Leave this lesson?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep learning' }).click()
  await expect(dialog).toBeHidden()
  await expect(heading).not.toBeFocused()
  await expect(heading).not.toHaveAttribute('tabindex', '-1')
  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.getByRole('heading', { name: "Steller's Jay" })).toBeVisible()
})

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

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('leave-session-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toBeHidden()
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

test('cancelling quiz Back keeps progression and automatic completion restores focus', async ({ app, page }) => {
  // With this shuffle, the target stays first among the three choices.
  await page.addInitScript(() => { Math.random = () => 0.5 })
  await app.gotoHome()
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  await page.getByRole('button', { name: /Next/i }).click()
  await page.getByRole('button', { name: /Next/i }).click()
  await page.getByRole('button', { name: /Start Quiz/i }).click()
  await expect(page.getByText('Question 1 of 5')).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: lessonChoices }).first().click()
  await expect(page.getByRole('paragraph').filter({ hasText: /^Correct!$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep learning' }).click()
  await page.clock.runFor(1600)
  await expect(page.getByText('Question 2 of 5')).toBeVisible()

  for (let question = 2; question <= 4; question++) {
    await page.getByRole('button', { name: lessonChoices }).first().click()
    await page.clock.runFor(1600)
    await expect(page.getByText(`Question ${question + 1} of 5`)).toBeVisible()
  }
  await page.getByRole('button', { name: lessonChoices }).first().click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.clock.runFor(1600)
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Lesson Complete!' })).toBeFocused()
})

for (const correct of [true, false]) {
  test(`confirming exit saves a marked ${correct ? 'correct' : 'wrong'} review answer across reload`, async ({ app, page }) => {
    await page.addInitScript(() => { Math.random = () => 0.5 })
    await app.completeLessonOne()
    await page.getByRole('button', { name: 'Quiz', exact: true }).click()
    await page.getByRole('button', { name: 'Start Review', exact: true }).click()
    await expect(page.getByText('1 / 3')).toBeVisible()
    // Freeze the feedback timer so this tests exit saving, not normal auto-advance.
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    await page.getByRole('button', { name: lessonChoices }).nth(correct ? 0 : 1).click()
    await expect(page.getByRole('paragraph').filter({ hasText: correct ? /^Correct!$/ : /^That was / })).toBeVisible()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'End this review?' })
    await expect(dialog).toContainText("Answers you've chosen are saved.")
    await dialog.getByRole('button', { name: 'End review' }).click()
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    await expect(page.getByText(/^1 reps(?: ·|$)/)).toHaveCount(1)
    await expect(page.getByText('0 reps', { exact: true })).toHaveCount(14)
    await page.clock.runFor(2000)
    await page.clock.resume()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.getByText(/^1 reps(?: ·|$)/)).toHaveCount(1)
    await expect(page.getByText('0 reps', { exact: true })).toHaveCount(14)
  })
}

test('leaving a review from the tab bar keeps saved answers and opens the tapped tab', async ({ app, page }) => {
  await app.completeLessonOne()
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await page.getByRole('button', { name: 'Start Review', exact: true }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()

  await page.getByRole('button', { name: /← Quit/ }).click()
  const dialog = page.getByRole('alertdialog', { name: 'End this review?' })
  await expect(dialog).toContainText("Answers you've chosen are saved.")
  await dialog.getByRole('button', { name: 'Keep going' }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await dialog.getByRole('button', { name: 'End review' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByText('0 reps')).toHaveCount(15)

  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start Review', exact: true })).toBeVisible()
})

test('a fast automatic save failure keeps keyboard focus inside the confirmation', async ({ app, page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5 })
  await app.completeLessonOne()
  await page.getByRole('button', { name: 'Quiz', exact: true }).click()
  await page.getByRole('button', { name: 'Start Review', exact: true }).click()
  await expect(page.getByText('1 / 3')).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date())

  // Fail just the next write, so dismissing the dialog can still retry the answer.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      IDBObjectStore.prototype.put = put
      throw new DOMException('Disk full', 'QuotaExceededError')
    }
  })
  await page.getByRole('button', { name: lessonChoices }).first().click()
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'End this review?' })
  await expect(dialog).toBeVisible()
  await page.clock.runFor(1600)
  // This checks the background error without making it keyboard-interactive.
  await expect(page.getByRole('alert')).toContainText('could not be fully saved')
  const cancel = dialog.getByRole('button', { name: 'Keep going' })
  const confirm = dialog.getByRole('button', { name: 'End review' })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Retry saving' }).click()
  await expect(page.getByText('2 / 3')).toBeVisible()
})
