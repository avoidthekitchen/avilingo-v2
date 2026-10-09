import { expect, test } from './fixtures'

test('public support and privacy pages work without starting the app', async ({ page, request }) => {
  const response = await page.goto('/beakspeak/support/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Support · BeakSpeak')
  await expect(page.getByRole('heading', { name: 'BeakSpeak support' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'support@verybusypeople.com' })).toHaveAttribute(
    'href', 'mailto:support@verybusypeople.com?subject=BeakSpeak%20support',
  )
  const stylesheet = await request.get('/beakspeak/information.css')
  expect(stylesheet.status()).toBe(200)
  expect(stylesheet.headers()['content-type']).toContain('text/css')

  await page.getByRole('navigation').getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveTitle('Privacy · BeakSpeak')
  await expect(page.getByRole('heading', { name: 'BeakSpeak privacy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Learning progress stays on your device' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'support@verybusypeople.com' })).toHaveAttribute(
    'href', 'mailto:support@verybusypeople.com?subject=BeakSpeak%20privacy',
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'BeakSpeak privacy' })).toBeVisible()
  await page.getByRole('link', { name: 'BeakSpeak demo' }).click()
  await expect(page.getByRole('heading', { name: 'Learn Birds' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Lesson \d:/ })).toHaveCount(5)
})

test('About exposes the public support and privacy destinations', async ({ page, app }) => {
  await app.gotoHome()
  await page.getByRole('button', { name: 'About' }).click()
  const navigation = page.getByRole('navigation', { name: 'Support and privacy' })
  await expect(navigation.getByRole('link', { name: 'Support' })).toHaveAttribute(
    'href', 'https://unformedideas.com/beakspeak/support/',
  )
  await expect(navigation.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
    'href', 'https://unformedideas.com/beakspeak/privacy/',
  )
})
