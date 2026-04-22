import { expect, test as base, type Page } from '@playwright/test'

class BeakSpeakApp {
  constructor(private readonly page: Page) {}

  async gotoHome() {
    await this.page.goto('/beakspeak/')
    await expect(this.page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  }

  async resetProgress() {
    await this.gotoHome()
    await this.page.getByRole('button', { name: /Progress/ }).click()
    await expect(this.page.getByRole('heading', { name: 'Progress' })).toBeVisible()

    await this.page.getByRole('button', { name: 'Reset All Progress' }).click()
    await this.page.getByRole('button', { name: 'Yes, Reset' }).click()

    await expect(this.page.getByText('0', { exact: true }).first()).toBeVisible()
    await expect(this.page.getByText('Due Now')).toBeVisible()
  }

  async answerIntroQuiz(questionCount = 5) {
    for (let question = 1; question <= questionCount; question += 1) {
      await expect(this.page.getByText(`Question ${question} of ${questionCount}`)).toBeVisible()

      const choiceButtons = this.page.locator('button').filter({ has: this.page.locator('img') })
      await expect(choiceButtons).toHaveCount(3)
      await choiceButtons.first().click()

      // Correct answers auto-advance after 1.5s; incorrect answers show a Next button.
      await this.page.waitForTimeout(1800)

      const nextButton = this.page.getByRole('button', { name: 'Next' })
      if (await nextButton.isVisible()) {
        await nextButton.click()
      }
    }
  }

  async completeLessonOne() {
    await this.gotoHome()
    await expect(this.page.getByText('0 of 15 birds learned')).toBeVisible()

    await this.page.getByRole('button', { name: /Lesson 1: The unmistakable three/i }).click()

    await expect(this.page.getByRole('heading', { name: 'American Crow' })).toBeVisible()
    await this.page.getByRole('button', { name: /Next/i }).click()

    await expect(this.page.getByRole('heading', { name: "Steller's Jay" })).toBeVisible()
    await this.page.getByRole('button', { name: /Next/i }).click()

    await expect(this.page.getByRole('heading', { name: 'Northern Flicker' })).toBeVisible()
    await this.page.getByRole('button', { name: /Start Quiz/i }).click()

    await expect(this.page.getByText('Question 1 of 5')).toBeVisible()
    await this.answerIntroQuiz()

    await expect(this.page.getByRole('heading', { name: 'Lesson Complete!' })).toBeVisible()
    await this.page.getByRole('button', { name: 'Continue' }).click()

    await expect(this.page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
    await expect(this.page.getByText('3 of 15 birds learned')).toBeVisible()
    await expect(this.page.getByRole('button', { name: /Lesson 2: Backyard singers/i })).toBeEnabled()
  }

  async startReviewFromProgress() {
    await this.page.getByRole('button', { name: /Progress/ }).click()
    await expect(this.page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    await expect(this.page.getByRole('button', { name: /Start Review \(3 due\)/i })).toBeVisible()

    await this.page.getByRole('button', { name: /Start Review \(3 due\)/i }).click()
    await expect(this.page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

    await this.page.getByRole('button', { name: 'Start Review' }).click()
    await expect(this.page.getByRole('button', { name: /← Quit/i })).toBeVisible()
    await expect(this.page.getByText('1 / 3')).toBeVisible()
    await expect(this.page.locator('button').filter({ has: this.page.locator('img') })).toHaveCount(3)
  }
}

export const test = base.extend<{ app: BeakSpeakApp }>({
  app: async ({ page }, runFixture) => {
    const consoleErrors: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })
    page.on('pageerror', error => {
      consoleErrors.push(error.message)
    })

    await runFixture(new BeakSpeakApp(page))

    expect(consoleErrors).toEqual([])
  },
})

export { expect }
