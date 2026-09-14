import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor } from '@capacitor/core'
import { openExternalUrl } from './externalLinks'

vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: { openUrl: vi.fn().mockResolvedValue({ completed: true }) },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}))

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hands an HTTPS destination to the native external-app launcher', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)

    expect(openExternalUrl('https://xeno-canto.org/123')).toBe(true)

    expect(AppLauncher.openUrl).toHaveBeenCalledWith({ url: 'https://xeno-canto.org/123' })
  })

  it('leaves external destinations to normal browser link behavior on the web', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    expect(openExternalUrl('https://en.wikipedia.org/wiki/Bird')).toBe(false)

    expect(AppLauncher.openUrl).not.toHaveBeenCalled()
  })
})
