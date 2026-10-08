import { defineConfig } from '@playwright/test'

const port = Number(process.env.BEAKSPEAK_E2E_PORT ?? 4173)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('BEAKSPEAK_E2E_PORT must be a valid TCP port')
}
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: origin,
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: `npm run build:web && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/beakspeak/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
