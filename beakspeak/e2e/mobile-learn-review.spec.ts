import { test } from './fixtures'

test('mobile lesson 1 flow completes and starts review', async ({ app }) => {
  await app.resetProgress()
  await app.completeLessonOne()
  await app.startReviewFromProgress()
})
