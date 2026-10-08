import { test, expect } from './fixtures'

test('300% text keeps the lesson, quiz and navigation usable', async ({ page, app }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--app-text-scale', '3'))
  })
  await app.gotoHome()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toHaveCSS('font-size', '72px')
  await page.getByRole('button', { name: /Lesson 3:/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const paragraph = dialog.locator('p').first()
  expect(await paragraph.evaluate(node => parseFloat(getComputedStyle(node).lineHeight))).toBeGreaterThan(42)
  await page.getByRole('button', { name: 'Never mind' }).click()
  await page.getByRole('button', { name: /Lesson 1:/ }).click()
  for (const name of ['American Crow', "Steller's Jay", 'Northern Flicker']) {
    const title = page.getByRole('heading', { name })
    await expect(title).toBeVisible()
    const bounds = await title.evaluate(node => {
      const card = node.closest('.rounded-2xl')!
      const caption = node.parentElement!
      return { title: node.getBoundingClientRect().top, card: card.getBoundingClientRect().top, captionBottom: caption.getBoundingClientRect().bottom, infoTop: caption.parentElement!.nextElementSibling!.getBoundingClientRect().top }
    })
    expect(bounds.title).toBeGreaterThanOrEqual(bounds.card)
    expect(bounds.captionBottom).toBeLessThanOrEqual(bounds.infoTop + 1)
    await page.getByRole('button', { name: /Next|Start Quiz/ }).click()
  }
  await app.answerIntroQuiz()
  await page.getByRole('button', { name: 'Continue' }).click()
  await app.completeReviewFromProgress()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const buttons = page.locator('.app-navigation button')
  await expect(buttons).toHaveCount(4)
  for (const button of await buttons.all()) {
    expect(await button.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(button).toBeInViewport()
  }
})
