import { expect, test as base, type Locator, type Page } from '@playwright/test'

const lessonOneChoiceName = /American Crow|Steller's Jay|Northern Flicker/

class BeakSpeakApp {
  constructor(private readonly page: Page) {}

  async gotoHome() {
    await this.page.goto('/beakspeak/')
    await expect(this.page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  }

  async verifyInitialContentAndNavigation() {
    await this.gotoHome()
    await expect(this.page.getByText('0 of 15 birds introduced')).toBeVisible()
    await expect(this.page.getByRole('button', { name: /^Lesson \d:/ })).toHaveCount(5)

    await this.page.getByRole('button', { name: /Quiz/ }).click()
    await expect(this.page.getByRole('heading', { name: 'No birds introduced yet' })).toBeVisible()

    await this.page.getByRole('button', { name: /Progress/ }).click()
    await expect(this.page.getByRole('heading', { name: 'Progress' })).toBeVisible()

    await this.page.getByRole('button', { name: 'About' }).click()
    await expect(this.page.getByRole('heading', { name: 'Credits & Attribution' })).toBeVisible()
    await expect(this.page.getByRole('heading', { level: 3 })).toHaveCount(15)
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

      const expectedNextView = question < questionCount
        ? this.page.getByText(`Question ${question + 1} of ${questionCount}`)
        : this.page.getByRole('heading', { name: 'Lesson Complete!' })
      await this.answerThreeChoiceAndAdvance(expectedNextView)
    }
  }

  private async answerThreeChoiceAndAdvance(expectedNextView: Locator) {
    const choiceButtons = this.page.getByRole('button', { name: lessonOneChoiceName })
    await expect(choiceButtons).toHaveCount(3)
    await choiceButtons.first().click()

    const nextButton = this.page.getByRole('button', { name: 'Next' })
    await expect(nextButton.or(expectedNextView)).toBeVisible({ timeout: 3_000 })
    if (await nextButton.isVisible()) {
      await nextButton.click()
    }
    await expect(expectedNextView).toBeVisible()
  }

  async completeLessonOne() {
    await this.gotoHome()
    await expect(this.page.getByText('0 of 15 birds introduced')).toBeVisible()

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
    await expect(this.page.getByText('3 of 15 birds introduced')).toBeVisible()
    await expect(this.page.getByRole('button', { name: /Lesson 2: Backyard singers/i })).toBeEnabled()
  }

  async completeReviewFromProgress() {
    await this.page.getByRole('button', { name: /Progress/ }).click()
    await expect(this.page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    await expect(this.page.getByRole('button', { name: /Start Review \(3 due\)/i })).toBeVisible()

    await this.page.getByRole('button', { name: /Start Review \(3 due\)/i }).click()
    await expect(this.page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

    await this.page.getByRole('button', { name: 'Start Review' }).click()
    await expect(this.page.getByRole('button', { name: /← Quit/i })).toBeVisible()
    await expect(this.page.getByText('1 / 3')).toBeVisible()

    for (let answer = 1; answer <= 3; answer += 1) {
      await expect(this.page.getByText(`${answer} / 3`)).toBeVisible()
      const expectedNextView = answer < 3
        ? this.page.getByText(`${answer + 1} / 3`)
        : this.page.getByRole('heading', { name: /\d+ \/ 3/ })
      await this.answerThreeChoiceAndAdvance(expectedNextView)
    }

    await expect(this.page.getByRole('heading', { name: /\d+ \/ 3/ })).toBeVisible()
    await this.page.getByRole('button', { name: 'Back to Home' }).click()
    await expect(this.page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

    await this.page.reload()
    await expect(this.page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
    await this.page.getByRole('button', { name: /Progress/ }).click()
    await expect(this.page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    await expect(this.page.getByText('1 reps')).toHaveCount(3)
  }

  async verifySkipAheadConsequences() {
    await this.gotoHome()
    await this.page.getByRole('button', { name: /Lesson 3:/i }).click()
    await expect(this.page.getByRole('dialog')).toBeVisible()
    await expect(this.page.getByText('Take It Step by Step')).toBeVisible()
    await this.page.getByRole('button', { name: 'Skip Ahead Anyway' }).click()

    await expect(this.page.getByText('1 / 3')).toBeVisible()
    await this.page.getByRole('button', { name: /← Back/i }).click()
    await this.page.getByRole('button', { name: /Progress/ }).click()

    await expect(this.page.getByText('6', { exact: true }).first()).toBeVisible()
    await expect(this.page.getByText('0 reps')).toHaveCount(15)
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
