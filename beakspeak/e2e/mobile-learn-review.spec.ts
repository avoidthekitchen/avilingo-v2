import { test } from './fixtures'

test('mobile learner completes the learning loop and sees review progress', async ({ app }) => {
  await app.resetProgress()
  await app.verifyInitialContentAndNavigation()
  await app.completeLessonOne()
  await app.completeReviewFromProgress()
})

test('Skip Ahead introduces skipped birds without fabricating review history', async ({ app }) => {
  await app.resetProgress()
  await app.verifySkipAheadConsequences()
})
