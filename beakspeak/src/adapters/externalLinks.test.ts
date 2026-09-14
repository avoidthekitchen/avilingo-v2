import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { openExternalUrl } from './externalLinks'

vi.mock('@capacitor/browser', () => ({
  Browser: { open: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}))

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens an external destination in the native browser surface', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)

    expect(openExternalUrl('https://xeno-canto.org/123')).toBe(true)

    expect(Browser.open).toHaveBeenCalledWith({ url: 'https://xeno-canto.org/123' })
  })

  it('leaves external destinations to normal browser link behavior on the web', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    expect(openExternalUrl('https://en.wikipedia.org/wiki/Bird')).toBe(false)

    expect(Browser.open).not.toHaveBeenCalled()
  })
})
